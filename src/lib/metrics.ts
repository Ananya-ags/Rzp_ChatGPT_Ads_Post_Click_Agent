/**
 * Kept revenue = paid revenue − refunds − RTO. Orders whose return window is still open use the
 * predicted return probability ("using predicted returns"). Shared by the merchant console and validate-data.
 */
import type { Order, OrdersSessions, Session } from "./schemas";

export const BAD_STATUSES = new Set<Order["status"]>(["returned", "RTO", "refunded"]);

export function expectedBad(o: Order): number {
  if (o.window_closed) return BAD_STATUSES.has(o.status) ? 1 : 0;
  return o.predicted_return_prob;
}

export type Slice = { sessions: number; orders: number; kept: number; keptPerClick: number; returnRtoRate: number; chatOpenRate: number; conversion: number; predictedShare: number };

export function slice(data: OrdersSessions, filter: (s: Session) => boolean): Slice {
  const sessions = data.sessions.filter(filter);
  const ids = new Set(sessions.map((s) => s.session_id));
  const orders = data.orders.filter((o) => ids.has(o.session_id));
  const kept = orders.reduce((s, o) => s + o.kept_revenue, 0);
  const bad = orders.reduce((s, o) => s + expectedBad(o), 0);
  const open = orders.filter((o) => !o.window_closed).length;
  return {
    sessions: sessions.length,
    orders: orders.length,
    kept,
    keptPerClick: sessions.length ? kept / sessions.length : 0,
    returnRtoRate: orders.length ? bad / orders.length : 0,
    chatOpenRate: sessions.length ? sessions.filter((s) => s.chat_opened).length / sessions.length : 0,
    conversion: sessions.length ? orders.length / sessions.length : 0,
    predictedShare: orders.length ? open / orders.length : 0,
  };
}

export const isChatgpt = (s: Session) => s.channel === "chatgpt_ads";
export const byArm = (arm: Session["arm"]) => (s: Session) => isChatgpt(s) && s.arm === arm;
export const byAdGroup = (id: string, arm?: Session["arm"]) => (s: Session) => isChatgpt(s) && s.ad_group_id === id && (!arm || s.arm === arm);
