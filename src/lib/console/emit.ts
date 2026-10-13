"use client";
/**
 * The site side of the AI console ("under the hood" view at /demo). Pages call emit(); events go out on
 * BroadcastChannel("cosmos-console") ONLY while a console is listening (it pings every second). Normal visitors
 * have no console, so emit() is a no-op for them: nothing is posted and nothing is stored.
 *
 * Handshake: on first use the site posts "site-ping"; a console replies "console-hello" and keeps pinging. Events
 * from the first moments of a page load (before the first hello arrives) wait in a short in-memory queue and are
 * dropped if no console answers within 2 seconds.
 */

export type ConsoleSource = "ai" | "code" | "rule" | "cookie" | "login" | "session";
export type ConsoleStatus = "ok" | "caught" | "fallback" | "info";
export type ConsoleEvent = {
  ts: number;
  journey_step: "arrival" | "session" | "page" | "chat" | "action" | "checkout" | "order" | "merchant";
  kind: string; // e.g. "arrival", "page_view", "rail", "opener", "message", "route", "tool", "guard", "usage", "step"
  title: string;
  detail?: string;
  source: ConsoleSource;
  status: ConsoleStatus;
  latency_ms?: number;
  data?: Record<string, unknown>;
  page?: string; // the page visit it belongs to (set by the bridge)
};

const CHANNEL = "cosmos-console";
const LISTEN_TTL_MS = 4000;
const QUEUE_MS = 2000;

let channel: BroadcastChannel | null = null;
let lastHello = 0;
let startedAt = 0;
let queue: ConsoleEvent[] = [];
let currentPage = "";

function init() {
  if (channel || typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
  try {
    channel = new BroadcastChannel(CHANNEL);
  } catch {
    return;
  }
  startedAt = Date.now();
  channel.onmessage = (m) => {
    if (m.data?.type !== "console-hello") return;
    lastHello = Date.now();
    if (queue.length) {
      for (const e of queue) channel?.postMessage({ type: "event", event: e });
      queue = [];
    }
  };
  channel.postMessage({ type: "site-ping" });
}

/** True while a console has pinged within the last few seconds. */
export function consoleListening() {
  init();
  return Date.now() - lastHello < LISTEN_TTL_MS;
}

/** The page visit later events are grouped under (set by the bridge on navigation). */
export function setConsolePage(label: string) {
  currentPage = label;
}

export function emit(e: Omit<ConsoleEvent, "ts" | "page"> & { page?: string }) {
  init();
  if (!channel) return;
  const event: ConsoleEvent = { ...e, ts: Date.now(), page: e.page ?? currentPage };
  if (Date.now() - lastHello < LISTEN_TTL_MS) channel.postMessage({ type: "event", event });
  else if (Date.now() - startedAt < QUEUE_MS) queue.push(event); // the console may not have answered yet
}

let chatBagAt = 0;
/** The chat just added to the bag (so the bag watcher doesn't log the same addition twice). */
export const markChatBag = () => void (chatBagAt = Date.now());
export const lastChatBagAt = () => chatBagAt;

/** Shorten long values for one-line display (never full prompts or raw JSON walls). */
export const clip = (s: unknown, n = 120) => {
  const t = typeof s === "string" ? s : JSON.stringify(s ?? "");
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
