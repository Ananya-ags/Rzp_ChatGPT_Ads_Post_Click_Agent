"use client";
/**
 * Orders placed in this browser session (test mode): kept in sessionStorage with a small cookie index, so the
 * merchant console can later show "Orders from this session (test mode)". Each confirmed order is also emitted on
 * the "cosmos-console" BroadcastChannel for the AI console (attribution, predicted returns and kept revenue).
 * All storage is in try/catch: blocked storage (private mode, iframes) never breaks the confirmation.
 */
import { emit } from "./console/emit";

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
  // the AI console's view of the outcome (a no-op unless the console is listening)
  const items = o.prediction.items.map((i) => `${i.sku} ${Math.round(i.return_probability * 100)}%`).join(", ");
  emit({ journey_step: "order", kind: "attribution", title: o.attribution.ad_group === "direct" ? "Order attributed: direct visit (no ad)" : `Order attributed to ${o.attribution.ad_group} via oppref ${o.attribution.oppref ?? "(none)"}`, detail: `campaign ${o.attribution.campaign_id} · ad group ${o.attribution.ad_group_id} · arm ${o.attribution.arm} · ${o.payment_method}`, source: "session", status: "ok", data: o.attribution });
  emit({ journey_step: "order", kind: "returns", title: `Predicted return probability: ${items}`, detail: o.prediction.items.map((i) => i.source).join(" · "), source: "code", status: "info", data: { items: o.prediction.items } });
  emit({ journey_step: "order", kind: "kept", title: `Predicted kept revenue ₹${o.prediction.predicted_kept_revenue_inr.toLocaleString("en-IN")}`, detail: `paid ₹${o.prediction.paid_inr.toLocaleString("en-IN")} − refunds ₹${o.prediction.predicted_refunds_inr.toLocaleString("en-IN")} − RTO ₹${o.prediction.predicted_rto_inr.toLocaleString("en-IN")} (RTO probability ${Math.round(o.prediction.rto_probability * 100)}%)`, source: "code", status: "ok", data: o.prediction });
}

export const findOrder = (id: string) => readOrders().find((o) => o.id === id) ?? null;
