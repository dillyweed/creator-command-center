import "dotenv/config";
import express from "express";
import cors from "cors";
import chatRouter from "./src/routes/chat.js";
import orchestrateRouter from "./src/routes/orchestrate.js";
import statsRouter from "./src/routes/stats.js";

const app = express();
const PORT = process.env.PORT || 8787;

const origins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim());

app.use(cors({ origin: origins }));
app.use(express.json({ limit: "1mb" }));

// Health check - used to confirm the skeleton is live (step 2 deploy).
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "creator-command-center-backend",
    hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY),
    time: new Date().toISOString(),
  });
});

// List the bots the frontend can talk to.
app.get("/api/bots", (_req, res) => {
  res.json({ bots: ["ceo", "research", "analytics"] });
});

// Direct 1:1 chat with a single bot (Research / Analytics / CEO). Step 4.
app.use("/api/chat", chatRouter);

// CEO orchestration: delegate -> collect -> synthesize. Step 5.
app.use("/api/orchestrate", orchestrateRouter);

// Stats: manual save + auto-refresh from TikTok/Instagram, persisted to
// Supabase when configured. Step 7.
app.use("/api/stats", statsRouter);

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

app.listen(PORT, () => {
  console.log(`[command-center] backend listening on http://localhost:${PORT}`);
});
