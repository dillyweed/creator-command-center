import { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Sidebar from "./components/Sidebar.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import BotView from "./pages/BotView.jsx";

export default function App() {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar (hidden on md+) */}
        <div className="flex items-center gap-3 border-b border-bd bg-s1 px-4 py-3 md:hidden">
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            className="text-tp"
          >
            <i className="ti ti-menu-2 text-[20px]" aria-hidden="true" />
          </button>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
            Command Center
          </span>
        </div>

        <main className="flex flex-1 flex-col overflow-hidden bg-bg">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/bot/ceo" element={<BotView botId="ceo" />} />
            <Route path="/bot/research" element={<BotView botId="research" />} />
            <Route path="/bot/analytics" element={<BotView botId="analytics" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
