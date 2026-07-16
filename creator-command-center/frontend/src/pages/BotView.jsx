import { useEffect, useRef, useState } from "react";
import { getBot } from "../data/bots.js";
import { loadAllChats, saveAllChats } from "../lib/chats.js";
import { sendChat, orchestrate } from "../lib/api.js";
import { logActivity } from "../lib/activity.js";
import DelegationPanel from "../components/DelegationPanel.jsx";
import Sources from "../components/Sources.jsx";

export default function BotView({ botId }) {
  const bot = getBot(botId);
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  // Load this bot's history whenever the route changes.
  useEffect(() => {
    const all = loadAllChats();
    setHistory(all[botId] || []);
    setInput("");
    setLoading(false);
  }, [botId]);

  // Keep the newest message in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, loading]);

  function persist(next) {
    setHistory(next);
    const all = loadAllChats();
    all[botId] = next;
    saveAllChats(all);
  }

  function clearChat() {
    persist([]);
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const withUser = [...history, { role: "user", content: text }];
    persist(withUser);
    setInput("");
    setLoading(true);
    logActivity({
      bot: botId,
      botName: bot.name,
      summary: text.length > 90 ? text.slice(0, 90) + "…" : text,
    });

    // API only needs role + content (strip UI-only fields like subAgents).
    const apiMessages = withUser.map((m) => ({ role: m.role, content: m.content }));

    try {
      if (botId === "ceo") {
        const { reply, subAgents } = await orchestrate(apiMessages);
        persist([...withUser, { role: "assistant", content: reply, subAgents }]);
      } else {
        const { reply, sources } = await sendChat(botId, apiMessages);
        persist([...withUser, { role: "assistant", content: reply, sources }]);
      }
    } catch (e) {
      persist([
        ...withUser,
        {
          role: "assistant",
          content:
            "Couldn't reach the bot. Check that the backend is running and ANTHROPIC_API_KEY is set.\n\n(" +
            e.message +
            ")",
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function onInput(e) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  if (!bot) return null;

  return (
    <>
      <header className="flex flex-shrink-0 items-center justify-between border-b border-bd bg-s1 px-4 py-4 md:px-6">
        <div className="flex items-center gap-3">
          <i className={`ti ${bot.icon} text-[22px] text-accent`} aria-hidden="true" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold text-tp">{bot.name}</span>
              {bot.orchestrator && (
                <span className="rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[9px] uppercase tracking-wide text-accent">
                  Orchestrator
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[11px] text-tm">{bot.desc}</div>
          </div>
        </div>
        <button
          onClick={clearChat}
          className="rounded-lg border border-bd2 px-3.5 py-1.5 text-[11px] text-ts transition-colors hover:bg-s2 hover:text-tp"
        >
          Clear
        </button>
      </header>

      {/* Messages */}
      <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-4 md:p-6">
        {history.length === 0 && !loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-2.5 opacity-40">
            <i className={`ti ${bot.icon} text-4xl text-tm`} aria-hidden="true" />
            <p className="text-center text-[13px] leading-relaxed text-tm">
              {bot.name} is ready.
              <br />
              <span className="text-[11px]">
                {bot.orchestrator
                  ? "Give it a goal — it delegates to Research and Analytics, then answers."
                  : "Ask anything."}
              </span>
            </p>
          </div>
        ) : (
          history.map((m, i) => (
            <div key={i} className="flex flex-col">
              <div className={`flex ${m.role === "user" ? "justify-end" : ""}`}>
                <div
                  className={`max-w-[76%] whitespace-pre-wrap break-words px-4 py-3 text-[14px] leading-[1.65] ${
                    m.role === "user"
                      ? "rounded-[14px_14px_3px_14px] border border-accent/25 bg-accent/10 text-tp"
                      : m.error
                      ? "rounded-[14px_14px_14px_3px] border border-bd bg-s2 text-ts"
                      : "rounded-[14px_14px_14px_3px] border border-bd bg-s2 text-tp"
                  }`}
                >
                  {m.content}
                </div>
              </div>
              {m.role === "assistant" && m.subAgents && (
                <DelegationPanel subAgents={m.subAgents} />
              )}
              {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                <div className="max-w-[76%] self-start">
                  <Sources sources={m.sources} />
                </div>
              )}
            </div>
          ))
        )}

        {loading && (
          <div className="flex">
            <div className="flex items-center gap-1.5 rounded-[14px_14px_14px_3px] border border-bd bg-s2 px-[18px] py-3.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tm [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tm [animation-delay:200ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tm [animation-delay:400ms]" />
              {botId === "ceo" && (
                <span className="ml-1.5 text-[11px] text-tm">
                  coordinating bots…
                </span>
              )}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-bd bg-s1 px-4 md:px-6 pb-5 pt-3.5">
        <div className="flex items-end gap-2.5 rounded-[10px] border border-bd2 bg-s2 px-3 py-2.5 focus-within:border-accent/40">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={onInput}
            onKeyDown={onKeyDown}
            placeholder={`Ask ${bot.name}...`}
            className="max-h-[120px] flex-1 resize-none bg-transparent text-[14px] leading-normal text-tp outline-none placeholder:text-tm"
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            aria-label="Send"
            className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[7px] bg-accent transition-opacity hover:opacity-85 disabled:bg-s3 disabled:opacity-100"
          >
            <i
              className={`ti ti-send text-[15px] ${
                loading || !input.trim() ? "text-tm" : "text-white"
              }`}
              aria-hidden="true"
            />
          </button>
        </div>
        <div className="mt-1.5 text-center text-[10px] tracking-wide text-tm">
          Enter to send · Shift+Enter for new line
        </div>
      </div>
    </>
  );
}
