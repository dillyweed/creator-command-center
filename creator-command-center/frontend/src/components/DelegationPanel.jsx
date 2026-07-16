import { useState } from "react";
import { getBot } from "../data/bots.js";
import Sources from "./Sources.jsx";

// Collapsible breakdown shown under a CEO response: which specialist bots the
// CEO activated for this answer, and each bot's individual output.
export default function DelegationPanel({ subAgents }) {
  const [open, setOpen] = useState(false);
  if (!subAgents || subAgents.length === 0) return null;

  return (
    <div className="mt-2 max-w-[76%] self-start">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-bd bg-s1 px-2.5 py-1.5 text-[11px] text-ts transition-colors hover:text-tp"
      >
        <i
          className={`ti ti-chevron-right text-[13px] transition-transform ${
            open ? "rotate-90" : ""
          }`}
          aria-hidden="true"
        />
        {subAgents.length} bot{subAgents.length !== 1 ? "s" : ""} activated
        <span className="text-tm">
          ({subAgents.map((s) => s.name.replace(" bot", "")).join(", ")})
        </span>
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {subAgents.map((s, i) => {
            const meta = getBot(s.bot);
            return (
              <div
                key={i}
                className="rounded-lg border border-bd bg-s1 p-3"
              >
                <div className="mb-2 flex items-center gap-2 border-b border-bd pb-2">
                  <i
                    className={`ti ${meta?.icon || "ti-robot"} text-[15px] ${
                      s.error ? "text-tm" : "text-accent"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="text-[12px] font-semibold text-tp">
                    {s.name}
                  </span>
                </div>
                <div className="mb-2">
                  <div className="text-[10px] uppercase tracking-wide text-tm">
                    Task
                  </div>
                  <div className="mt-0.5 text-[12px] leading-relaxed text-ts">
                    {s.prompt}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-tm">
                    Output
                  </div>
                  <div className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-tp">
                    {s.output}
                  </div>
                </div>
                <Sources sources={s.sources} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
