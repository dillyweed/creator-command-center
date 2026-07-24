import { Router } from "express";
import { getClient, MODEL_CEO, MODEL_SUBBOT, runMessage } from "../anthropic.js";
import { BOTS, CEO_SYSTEM, CEO_PLANNER_SYSTEM } from "../bots.js";
import { fetchInspiration, inspirationBlock } from "../services/inspiration.js";
import { apifyBudgetOk, recordApifyRuns } from "../services/limits.js";

const router = Router();

// Tool the CEO planner is forced to call, so delegations come back structured.
const DELEGATE_TOOL = {
  name: "delegate",
  description:
    "Decide which specialist bots to consult and the specific task prompt for each. Empty list means the CEO answers alone.",
  input_schema: {
    type: "object",
    properties: {
      delegations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            bot: { type: "string", enum: ["research", "analytics"] },
            prompt: {
              type: "string",
              description: "The specific task/question for this bot.",
            },
          },
          required: ["bot", "prompt"],
        },
      },
    },
    required: ["delegations"],
  },
};

// POST /api/orchestrate
// body: { messages: [{ role, content }, ...] }
// -> { reply, subAgents: [{ bot, name, prompt, output, sources }] }
router.post("/", async (req, res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : null;
  if (!messages || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }

  const client = getClient();
  if (!client) {
    return res
      .status(503)
      .json({ error: "Server is missing ANTHROPIC_API_KEY. Add it to .env." });
  }

  const goal =
    [...messages].reverse().find((m) => m.role === "user")?.content || "";

  try {
    // 1. PLAN — decide delegations (fall back to none on failure).
    let delegations = [];
    try {
      const plan = await client.messages.create({
        model: MODEL_CEO,
        max_tokens: 700,
        system: CEO_PLANNER_SYSTEM,
        tools: [DELEGATE_TOOL],
        tool_choice: { type: "tool", name: "delegate" },
        messages: [{ role: "user", content: goal }],
      });
      const toolUse = plan.content.find((b) => b.type === "tool_use");
      if (Array.isArray(toolUse?.input?.delegations)) {
        delegations = toolUse.input.delegations;
      }
    } catch (e) {
      console.error("[orchestrate] planning failed, answering directly:", e?.message);
    }
    delegations = delegations.filter((d) => BOTS[d.bot]).slice(0, 4);

    // Inspiration channels: scrape the creators the user wants to model and
    // hand the real intel to the Research bot (budget-permitting).
    const period = [7, 30].includes(Number(req.body?.period)) ? Number(req.body.period) : 30;
    let intel = "";
    let inspirationData = null;
    try {
      const channels = Array.isArray(req.body?.inspiration) ? req.body.inspiration : [];
      if (channels.length && apifyBudgetOk()) {
        inspirationData = await fetchInspiration(channels, period, { maxChannels: 8 });
        recordApifyRuns(inspirationData.runs || 0);
        intel = inspirationBlock(inspirationData, period);
      }
    } catch (e) {
      console.warn("[orchestrate] inspiration scrape failed:", e?.message);
    }
    // If we got real intel, force the Research bot to run and receive it.
    if (intel) {
      let research = delegations.find((d) => d.bot === "research");
      if (!research) {
        research = {
          bot: "research",
          prompt: goal || "Analyze what is working for these creators and the niche right now.",
        };
        delegations.unshift(research);
        delegations = delegations.slice(0, 4);
      }
      research.prompt = `${research.prompt}\n\nIMPORTANT: Analyze ONLY the creators in the INSPIRATION CHANNELS INTEL below. Do NOT search for, add, or mention any other creators or channels. Pull out the specific outlier videos with their real view counts and dates.\n\n${intel}`;
    }

    // 2. EXECUTE — sub-bots in parallel. Research runs with web search (step 6).
    const subAgents = await Promise.all(
      delegations.map(async (d) => {
        const bot = BOTS[d.bot];
        try {
          const { text, sources } = await runMessage({
            system: bot.system,
            messages: [{ role: "user", content: d.prompt }],
            model: MODEL_SUBBOT,
            maxTokens: 1600,
            webSearch: Boolean(bot.webSearch),
          });
          return {
            bot: d.bot,
            name: bot.name,
            prompt: d.prompt,
            output: text,
            sources,
          };
        } catch (e) {
          console.error(`[orchestrate] ${d.bot} failed:`, e?.message);
          return {
            bot: d.bot,
            name: bot.name,
            prompt: d.prompt,
            output: "(this bot could not be reached)",
            sources: [],
            error: true,
          };
        }
      })
    );

    // 3 + 4. SYNTHESIZE — hand the reports (and any sources) to the CEO.
    const synthMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    if (subAgents.length) {
      const contextBlock =
        "\n\n---\nSpecialist bot reports (synthesize these into one answer; do not just repeat them):\n\n" +
        subAgents
          .map((s) => {
            const src = s.sources?.length
              ? "\nSources: " + s.sources.map((x) => x.url).join(", ")
              : "";
            return `## ${s.name}\nTask given: ${s.prompt}\nReport:\n${s.output}${src}`;
          })
          .join("\n\n");
      const ideasDirective = intel
        ? `\n\n${intel}\n\nGROUNDING RULES (follow exactly):\n- The INSPIRATION CHANNELS INTEL above is the ONLY source of truth. It is real scraped data (view counts, dates, outlier multiples, URLs) from the exact channels the user chose to track, covering the last ${period} days.\n- Do NOT mention, list, compare, or reference ANY creator, channel, or video that is not in that intel. Never invent channels. If a specialist report names other creators, ignore them.\n- START your answer with an OUTLIERS section: list the top-performing videos from the intel over the last ${period} days. For each give the channel @handle, the view count, how many times above that channel own average it is, the post date, and the URL. Rank them highest-first.\n- THEN give your CONTENT-IDEAS OUTPUT: What is Working (the patterns behind those outliers), 8-10 Shootable Concepts modeled on the specific outlier videos, and the Fastest Bet.`
        : "";
      const last = synthMessages[synthMessages.length - 1];
      synthMessages[synthMessages.length - 1] = {
        ...last,
        content: last.content + contextBlock + ideasDirective,
      };
    }

    const { text: reply } = await runMessage({
      system: CEO_SYSTEM,
      messages: synthMessages,
      model: MODEL_CEO,
      maxTokens: 2800,
    });

    res.json({ reply, subAgents, inspiration: inspirationData });
  } catch (err) {
    console.error("[orchestrate] error:", err?.message || err);
    res.status(502).json({ error: "Orchestration failed." });
  }
});

export default router;
