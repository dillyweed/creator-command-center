import { NavLink } from "react-router-dom";
import { BOTS } from "../data/bots.js";

const linkBase =
  "flex w-full items-center gap-2.5 rounded-md border border-l-2 border-transparent px-3 py-2.5 text-left transition-colors hover:bg-s2";
const linkActive = "bg-s2 border-bd2 !border-l-accent";

function Item({ to, icon, label, desc, onClose }) {
  return (
    <NavLink
      to={to}
      end
      onClick={onClose}
      className={({ isActive }) => `${linkBase} ${isActive ? linkActive : ""}`}
    >
      {({ isActive }) => (
        <>
          <i
            className={`ti ${icon} w-5 flex-shrink-0 text-center text-[17px] ${
              isActive ? "text-accent" : "text-tm"
            }`}
            aria-hidden="true"
          />
          <div>
            <div
              className={`text-[13px] font-medium ${
                isActive ? "text-tp" : "text-ts"
              }`}
            >
              {label}
            </div>
            <div className="mt-px text-[10px] text-tm">{desc}</div>
          </div>
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar({ open = false, onClose = () => {} }) {
  return (
    <>
      {/* Backdrop on mobile when the drawer is open */}
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[220px] min-w-[220px] flex-col border-r border-bd bg-s1 transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-bd px-4 pb-3.5 pt-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
              Command Center
            </div>
            <div className="mt-0.5 text-[11px] text-tm">Your creator dashboard</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="text-tm md:hidden"
          >
            <i className="ti ti-x text-[18px]" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          <Item
            to="/"
            icon="ti-layout-dashboard"
            label="Dashboard"
            desc="Your overview"
            onClose={onClose}
          />
          <div className="mx-1 my-2 h-px bg-bd" />
          {BOTS.map((b) => (
            <Item
              key={b.id}
              to={`/bot/${b.id}`}
              icon={b.icon}
              label={b.name}
              desc={b.desc}
              onClose={onClose}
            />
          ))}
        </nav>

        <div className="flex items-center gap-2 border-t border-bd px-4 py-3.5">
          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-success shadow-[0_0_5px_#2ecc71]" />
          <span className="text-[10px] uppercase tracking-[0.1em] text-tm">
            Live
          </span>
        </div>
      </aside>
    </>
  );
}
