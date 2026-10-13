import type { UIMessage } from "ai";

export type ChatDivider = { afterId: string; label: string };
export type SavedChat = { messages: UIMessage[]; dividers: ChatDivider[]; lastSku: string | null; adGroupId: string | null; arm: "A" | "B" | "C" | null };

/** Stored browser data is untrusted. A stale/corrupt entry must never prevent the shop or chat from opening. */
export function parseSavedChat(raw: string): SavedChat | null {
  try {
    const value = JSON.parse(raw);
    if (!value || !Array.isArray(value.messages) || !Array.isArray(value.dividers)) return null;
    if (!value.messages.every((m: UIMessage) => m && typeof m.id === "string" && ["user", "assistant", "system"].includes(m.role) && Array.isArray(m.parts) && m.parts.every((p) => p && typeof p.type === "string" && (p.type !== "text" || typeof p.text === "string")))) return null;
    if (!value.dividers.every((d: ChatDivider) => d && typeof d.afterId === "string" && typeof d.label === "string")) return null;
    return value as SavedChat;
  } catch {
    return null;
  }
}
