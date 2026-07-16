import { Router } from "express";
import { getClient, MODEL_CEO, MODEL_SUBBOT, runMessage } from "../anthropic.js";
import { BOTS, CEO_SYSTEM, CEO_PLANNER_SYSTEM } from "../bots.js";

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

    // 2. EXECUTE — sub-bots in parallel. Research runs with web search (step 6).
    const subAgents = await Promise.all(
      delegations.map(async (d) => {
        const bot = BOTS[d.bot];
        try {
          const { text, sources } = await runMessage({
            system: bot.system,
            messages: [{ role: "user", content: d.prompt }],
            model: MODEL_SUBBOT,
            maxTokens: 1200,
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
      const last = synthMessages[synthMessages.length - 1];
      synthMessages[synthMessages.length - 1] = {
        ...last,
        content: last.content + contextBlock,
      };
    }

    const { text: reply } = await runMessage({
      system: CEO_SYSTEM,
      messages: synthMessages,
      model: MODEL_CEO,
      maxTokens: 1600,
    });

    res.json({ reply, subAgents });
  } catch (err) {
    console.error("[orchestrate] error:", err?.message || err);
    res.status(502).json({ error: "Orchestration failed." });
  }
});

export default router;
