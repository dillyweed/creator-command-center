// Per-bot chat history in localStorage. Each message is
// { role: "user"|"assistant", content: string, subAgents?: [...] }.
const KEY = "cc-chats";

export function loadAllChats() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveAllChats(chats) {
  localStorage.setItem(KEY, JSON.stringify(chats));
}
