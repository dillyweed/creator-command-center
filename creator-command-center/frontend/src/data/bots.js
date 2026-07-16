// Shared bot metadata for the UI. System prompts live on the backend
// (backend/src/bots.js) so the API key and prompt logic stay server-side.
//
// Per the build brief there are exactly THREE bots. The CEO bot is the
// orchestrator: the creator talks to it, and it delegates to Research and
// Analytics, then synthesizes one unified response.

export const BOTS = [
  {
    id: "ceo",
    name: "CEO bot",
    icon: "ti-briefcase",
    desc: "Orchestrator - strategy & growth",
    orchestrator: true,
  },
  {
    id: "research",
    name: "Research bot",
    icon: "ti-search",
    desc: "Meta-glasses & gambling intel",
  },
  {
    id: "analytics",
    name: "Analytics bot",
    icon: "ti-chart-bar",
    desc: "Live channel lookups & monthly views",
  },
];

export const getBot = (id) => BOTS.find((b) => b.id === id);
