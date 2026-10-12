"use client";
/**
 * Shared demo state in localStorage (no database). Every access is wrapped in try/catch so the page
 * still renders in private windows or with storage blocked. Tabs stay in sync via the storage event.
 */
import { useSyncExternalStore } from "react";

export type CartLine = { sku: string; qty: number };
export type DemoState = {
  cart: CartLine[];
  approvedProposals: string[];
  agentPaused: boolean;
  returningVisitor: boolean;
  loggedIn: boolean;
  loginOffered: boolean;
};

const KEY = "cosmos-demo-state-v1";
let snapshot: DemoState | null = null; // cached for useSyncExternalStore (must be a stable object)
let memory: DemoState | null = null; // fallback when localStorage is unavailable
let storageBlocked = false;
const DEFAULT: DemoState = { cart: [], approvedProposals: [], agentPaused: false, returningVisitor: false, loggedIn: false, loginOffered: false };
const EVENT = "cosmos-demo-state";

export function readState(): DemoState {
  if (memory) return memory;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT;
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
