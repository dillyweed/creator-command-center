import { Router } from "express";
import { getClient, MODEL_SUBBOT, MODEL_CEO, runMessage } from "../anthropic.js";
import { BOTS } from "../bots.js";

const router = Router();

// POST /api/chat/:botId
// body: { messages: [{ role, content }, ...] }
// -> { reply, sources }
// The Research bot runs with web search enabled (step 6) so it can find real
// videos in real time; Analytics and CEO answer without it.
router.post("/:botId", async (req, res) => {
  const { botId } = req.params;
  const bot = BOTS[botId];
  if (!bot) return res.status(404).json({ error: `Unknown bot: ${botId}` });

  const messages = Array.isArray(req.body?.messages) ? req.body.messages : null;
  if (!messages || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }

  if (!getClient()) {
    return res
      .status(503)
      .json({ error: "Server is missing ANTHROPIC_API_KEY. Add it to .env." });
  }

  try {
    const { text, sources } = await runMessage({
      system: bot.system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      model: botId === "ceo" ? MODEL_CEO : MODEL_SUBBOT,
      maxTokens: 1200,
      webSearch: Boolean(bot.webSearch),
    });
    res.json({ reply: text, sources });
  } catch (err) {
    console.error("[chat] error:", err?.message || err);
    res.status(502).json({ error: "Upstream model call failed." });
  }
});

export default router;
