"use client";
/**
 * Shared demo state in localStorage (no database). Every access is wrapped in try/catch so the page
 * still renders in private windows or with storage blocked. Tabs stay in sync via the storage event.
 */
import { useSyncExternalStore } from "react";
import { MAX_PER_SKU } from "./view";
import { APPROVED_COOKIE } from "./overrides";

export type CartLine = { sku: string; qty: number };
export type DemoState = {
  cart: CartLine[];
  approvedProposals: string[];
  dismissedProposals: string[]; // merchant console: dismissed (undo restores them to the inbox)
  agentPaused: boolean;
  returningVisitor: boolean;
  loggedIn: boolean;
  loginOffered: boolean;
  loginDismissed: boolean; // "Not now" on the login card: hidden for the rest of the session
};

const KEY = "cosmos-demo-state-v1";
export const BAG_COOKIE = "cosmos_bag";
let snapshot: DemoState | null = null; // cached for useSyncExternalStore (must be a stable object)
let memory: DemoState | null = null; // fallback when localStorage is unavailable
let storageBlocked = false;
const DEFAULT: DemoState = { cart: [], approvedProposals: [], dismissedProposals: [], agentPaused: false, returningVisitor: false, loggedIn: false, loginOffered: false, loginDismissed: false };
const EVENT = "cosmos-demo-state";

export function parseDemoState(raw: string | null): DemoState {
  if (!raw) return DEFAULT;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected an object");
    const data = parsed as Record<string, unknown>;
    if (data.cart !== undefined && !Array.isArray(data.cart) || data.approvedProposals !== undefined && !Array.isArray(data.approvedProposals)) {
      console.warn("Invalid saved cart or approvals; resetting those fields.");
    }
    const cart = new Map<string, number>();
    for (const value of Array.isArray(data.cart) ? data.cart : []) {
      if (!value || typeof value !== "object") continue;
      const line = value as Record<string, unknown>;
      if (typeof line.sku !== "string" || !line.sku.trim() || typeof line.qty !== "number" || !Number.isInteger(line.qty) || line.qty <= 0) continue;
      cart.set(line.sku, Math.min(MAX_PER_SKU, (cart.get(line.sku) ?? 0) + line.qty));
    }
    return {
      cart: [...cart].map(([sku, qty]) => ({ sku, qty })),
      approvedProposals: Array.isArray(data.approvedProposals) ? [...new Set(data.approvedProposals.filter((id): id is string => typeof id === "string"))] : [],
      dismissedProposals: Array.isArray(data.dismissedProposals) ? [...new Set(data.dismissedProposals.filter((id): id is string => typeof id === "string"))] : [],
      agentPaused: data.agentPaused === true,
      returningVisitor: data.returningVisitor === true,
      loggedIn: data.loggedIn === true,
      loginOffered: data.loginOffered === true,
      loginDismissed: data.loginDismissed === true,
    };
  } catch {
    console.warn("Invalid saved demo state; starting with an empty demo.");
    return DEFAULT;
  }
}

export function readState(): DemoState {
  if (memory) return memory;
  try {
    const raw = window.localStorage.getItem(KEY);
    return parseDemoState(raw);
  } catch {
    return DEFAULT;
  }
}

export function writeState(patch: Partial<DemoState> | ((s: DemoState) => Partial<DemoState>)) {
  const cur = readState();
  const next = { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    storageBlocked = true; // storage unavailable: keep state in memory for this tab
  }
  // refresh the cached snapshot even when no component is subscribed right now (e.g. on the login page),
  // otherwise the next page would render from a stale copy until a reload
  snapshot = next;
  if (storageBlocked) memory = next;
  // the bag also goes to a session cookie (SKU + qty only) so checkout prices it on the server from the catalogue
  if ("cart" in next) {
    try {
      document.cookie = `${BAG_COOKIE}=${encodeURIComponent(JSON.stringify(next.cart.map((l) => [l.sku, l.qty])))}; path=/; samesite=lax`;
    } catch {}
  }
  // merchant approvals go to a cookie too, so product pages and the chat route apply them on the server
  try {
    document.cookie = `${APPROVED_COOKIE}=${encodeURIComponent(next.approvedProposals.join(","))}; path=/; samesite=lax`;
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  } catch {}
  return next;
}

function subscribe(cb: () => void) {
  const onChange = () => {
    snapshot = null;
    cb();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
const getSnapshot = () => (snapshot ??= readState());
const getServerSnapshot = () => DEFAULT;
const noop = () => () => {};

/** [state, write, hydrated] */
export function useDemoState(): [DemoState, typeof writeState, boolean] {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = useSyncExternalStore(noop, () => true, () => false);
  return [state, writeState, ready];
}

/** Add one unit, never beyond `max` (the SKU's orderable stock). */
export function addToCart(sku: string, max: number) {
  return writeState((s) => {
    const line = s.cart.find((l) => l.sku === sku);
    if ((line?.qty ?? 0) >= max) return {};
    return { cart: line ? s.cart.map((l) => (l.sku === sku ? { ...l, qty: l.qty + 1 } : l)) : [...s.cart, { sku, qty: 1 }] };
  });
}

/** Set a line's quantity; 0 removes it from the bag. */
export function setQty(sku: string, qty: number, max: number) {
  qty = Math.min(qty, max);
  return writeState((s) => ({
    cart: qty <= 0 ? s.cart.filter((l) => l.sku !== sku) : s.cart.some((l) => l.sku === sku) ? s.cart.map((l) => (l.sku === sku ? { ...l, qty } : l)) : [...s.cart, { sku, qty }],
  }));
}
