import { Router } from "express";
import {
  isConfigured,
  authUrl,
  newConnKey,
  decodeState,
  exchangeTikTokAuto,
  exchangeInstagram,
  saveConnection,
} from "../services/oauth.js";

const router = Router();

const FRONTEND =
  (process.env.FRONTEND_URL ||
    (process.env.CORS_ORIGIN || "").split(",")[0] ||
    "http://localhost:5173").replace(/\/+$/, "");

// GET /api/auth/:platform  -> redirect the creator to the provider's login.
router.get("/:platform", (req, res) => {
  const { platform } = req.params;
  if (!["tiktok", "instagram"].includes(platform)) {
    return res.status(404).json({ error: "Unknown platform" });
  }
  if (!isConfigured(platform)) {
    return res
      .status(503)
      .json({ error: `${platform} OAuth isn't configured on the server yet.` });
  }
  const connKey = newConnKey();
  res.redirect(authUrl(platform, connKey));
});

// GET /api/auth/:platform/callback -> exchange code, store token, bounce back
// to the frontend with the connection key so the browser can remember it.
router.get("/:platform/callback", async (req, res) => {
  const { platform } = req.params;
  const { state, error } = req.query;
  const code = req.query.code || req.query.auth_code;
  const back = (params) =>
    res.redirect(`${FRONTEND}/?${new URLSearchParams(params)}`);

  if (error) return back({ [`${platform}_error`]: String(error) });
  if (!code || !state) return back({ [`${platform}_error`]: "missing_code" });

  const decoded = decodeState(String(state));
  const connKey = decoded?.k;
  if (!connKey) return back({ [`${platform}_error`]: "bad_state" });

  try {
    const conn =
      platform === "tiktok"
        ? await exchangeTikTokAuto(String(code))
        : await exchangeInstagram(String(code));
    await saveConnection({ conn_key: connKey, ...conn });
    return back({ [`${platform}_conn`]: connKey });
  } catch (e) {
    console.error(`[auth/${platform}] callback failed:`, e?.message);
    return back({ [`${platform}_error`]: e.message.slice(0, 120) });
  }
});

export default router;
