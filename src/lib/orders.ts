"use client";
/**
 * Orders placed in this browser session (test mode): kept in sessionStorage with a small cookie index, so the
 * merchant console can later show "Orders from this session (test mode)". Each confirmed order is also emitted on
 * the "cosmos-console" BroadcastChannel for the AI console (attribution, predicted returns and kept revenue).
 * All storage is in try/catch: blocked storage (private mode, iframes) never breaks the confirmation.
 */

export type OrderLine = { sku: string; title: string; qty: number; unit_inr: number; line_inr: number; care: string };
export type ConfirmedOrder = {
  id: string; // Razorpay payment ID in test mode; COD-… or pay_mock_… otherwise
  order_id: string;
  kind: "razorpay" | "mock" | "cod";
  receipt: string;
  method: "online" | "cod";
  payment_method: string;
  lines: OrderLine[];
  payable_inr: number;
  saved_inr: number;
  cod_fee_inr: number;
  arrives_label: string | null;
  city: string | null;
  pincode: string;
  attribution: { ad_group_id: string; ad_group: string; campaign_id: string; oppref: string | null; arm: string; session_id: string };
  prediction: { items: { sku: string; qty: number; paid_inr: number; return_probability: number; source: string }[]; rto_probability: number; paid_inr: number; predicted_refunds_inr: number; predicted_rto_inr: number; predicted_kept_revenue_inr: number };
  created_at: string;
};

const KEY = "cosmos-orders-v1";
const EVENTS = "cosmos-console-events";
let memory: ConfirmedOrder[] = [];

export function readOrders(): ConfirmedOrder[] {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as ConfirmedOrder[];
  } catch {}
  return memory;
}

export function saveOrder(o: ConfirmedOrder) {
  const all = [...readOrders().filter((x) => x.id !== o.id), o].slice(-20);
  memory = all;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
  try {
    // small index for the server side (merchant console later): ids, totals, methods only
    const index = all.map((x) => [x.id, x.payable_inr, x.method]).slice(-10);
    document.cookie = `cosmos_orders=${encodeURIComponent(JSON.stringify(index))}; path=/; samesite=lax`;
  } catch {}
  // the AI console's order event (same session; read later by the console)
  const event = { type: "order", at: o.created_at, order_id: o.id, attribution: o.attribution, payment_method: o.payment_method, method: o.method, prediction: o.prediction };
  try {
    const list = JSON.parse(window.sessionStorage.getItem(EVENTS) ?? "[]");
    window.sessionStorage.setItem(EVENTS, JSON.stringify([...list, event].slice(-50)));
  } catch {}
  try {
    const ch = new BroadcastChannel("cosmos-console");
    ch.postMessage(event);
    ch.close();
  } catch {}
}

export const findOrder = (id: string) => readOrders().find((o) => o.id === id) ?? null;
