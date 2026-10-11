/**
 * Seeded generator for orders_sessions.json (30 days) and chat_logs_seed.json.
 * Order counts per cell are allocated deterministically, then item choice is tuned so that
 * kept revenue per click lands on the targets the merchant console shows:
 *   arm C ≈ ₹61, arm A ≈ ₹44, B in between; wedding row ≈ ₹31; return+RTO C ≈ 9%, A ≈ 14%; chat open 15–25% in C.
 */
import type { Order, Product, ReturnsEntry, Session } from "../../src/lib/schemas";
import { rng } from "../../src/lib/rng";
import { addDays } from "../../src/lib/delivery";
import { adGroups, brand } from "./static";
import { THEMES, AG } from "./chat_messages";

export const SEED = 20261013;
const FROM = "2026-09-13";
const TO = "2026-10-12";
const DEMO_TODAY = "2026-10-13";
const W = "waterproof-everyday-under-5k", WED = "wedding-guest-gift", OFF = "office-minimal";

const CHATGPT_SESSIONS: Record<string, number> = { [W]: 1100, [WED]: 700, [OFF]: 600 };
const OTHER: { channel: Session["channel"]; n: number; cr: number }[] = [
  { channel: "google_search", n: 1300, cr: 0.04 },
  { channel: "google_shopping", n: 900, cr: 0.035 },
  { channel: "meta", n: 800, cr: 0.015 },
  { channel: "organic", n: 600, cr: 0.08 },
];
// kept revenue per click targets per (arm, ad group)
export const CELL_TARGETS: Record<"A" | "B" | "C", Record<string, number>> = {
  A: { [W]: 53, [WED]: 29, [OFF]: 47 },
  B: { [W]: 62, [WED]: 31, [OFF]: 56 },
  C: { [W]: 75, [WED]: 34, [OFF]: 68 },
};
const BAD_RATE = { A: 0.14, B: 0.115, C: 0.09 };
const ARM_RETURN_FACTOR = { A: 1.0, B: 0.85, C: 0.65 }; // agent's size/fit guidance lowers predicted returns
const PINCODES = ["411038", "400050", "560034", "110001", "500081", "700091", "380015", "122002", "201301", "452010", "600042", "302017", "845401"];

export function buildOrdersSessions(products: Product[], returns: ReturnsEntry[]) {
  const r = rng(SEED);
  const byHandle = new Map(products.map((p) => [p.handle, p]));
  const retBy = new Map(returns.map((x) => [x.sku, x]));
  const days = Array.from({ length: 30 }, (_, i) => addDays(FROM, i));
  const sessions: Session[] = [];
  let sid = 0;
  const newSession = (channel: Session["channel"], ag: string | null, arm: Session["arm"]): Session => ({
    session_id: `s_${String(++sid).padStart(5, "0")}`,
    date: r.pick(days),
    channel,
    ad_group_id: ag,
    oppref: channel === "chatgpt_ads" ? `opp_${r.id(12)}` : null,
    gclid: channel.startsWith("google") ? `Cj0K${r.id(16)}` : null,
    arm,
    device: r.chance(0.86) ? "mobile" : "desktop",
    chat_opened: false,
    login_offered: false,
    login_accepted: false,
    converted: false,
  });

  // ── sessions ──
  for (const [ag, n] of Object.entries(CHATGPT_SESSIONS)) {
    const arms: Session["arm"][] = Array.from({ length: n }, (_, i) => (i < n * 0.2 ? "A" : i < n * 0.6 ? "B" : "C"));
    for (const arm of r.shuffle(arms)) sessions.push(newSession("chatgpt_ads", ag, arm));
  }
  for (const o of OTHER) for (let i = 0; i < o.n; i++) sessions.push(newSession(o.channel, null, "A"));
  sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  sessions.forEach((s, i) => (s.session_id = `s_${String(i + 1).padStart(5, "0")}`));

  // chat opens: exactly 20% of arm C sessions per ad group
  for (const ag of Object.keys(CHATGPT_SESSIONS)) {
    const c = sessions.filter((s) => s.channel === "chatgpt_ads" && s.ad_group_id === ag && s.arm === "C");
    r.shuffle(c).slice(0, Math.round(c.length * 0.2)).forEach((s) => {
      s.chat_opened = true;
      if (r.chance(0.45)) {
        s.login_offered = true;
        s.login_accepted = r.chance(0.55);
      }
    });
  }

  // ── orders ──
  const orders: Order[] = [];
  let oid = 0;
  const priceOf = (h: string) => Number(byHandle.get(h)!.variants[0].price);
  const sellable = (h: string) => {
    const j = byHandle.get(h)!.metafields.jewellery;
    return !j.excluded;
  };
  const baseReturnProb = (h: string, ag: string | null) => {
    const e = retBy.get(h)!;
    return (ag && e.by_ad_group[ag]?.return_rate) || e.return_rate;
  };
  const amountFor = (items: Order["items"], prepaid: boolean) => {
    const sub = items.reduce((s, it) => s + it.price_inr * it.qty, 0);
    const ship = sub >= brand.policies.free_shipping_threshold_inr ? 0 : brand.policies.shipping_fee_inr;
    const disc = prepaid && sub > 1999 ? 100 : 0;
    const cod = prepaid ? 0 : brand.policies.cod_fee_inr;
    return sub + ship + cod - disc;
  };
  const makeOrder = (s: Session, handles: string[], armFactor: number): Order => {
    const pay: Order["payment_method"] = r.chance(0.6) ? "UPI" : r.chance(0.6) ? "card" : "COD";
    const items = handles.map((h) => {
      const p = byHandle.get(h)!;
      const v = r.pick(p.variants);
      return { sku: h, variant_sku: v.sku, qty: 1, price_inr: priceOf(h) };
    });
    const date = addDays(s.date, 0);
    const prob = Math.round(Math.min(0.6, baseReturnProb(handles[0], s.ad_group_id) * armFactor) * 1000) / 1000;
    // window closes 15 days after delivery (~3 days transit); still open → predicted
    const windowClosed = addDays(date, 3 + brand.policies.return_window_days) < DEMO_TODAY;
    const status: Order["status"] = windowClosed ? "delivered" : addDays(date, 4) >= DEMO_TODAY ? "in_transit" : "delivered";
    const o: Order = {
      order_id: `CSM-${String(5000 + ++oid)}`,
      session_id: s.session_id,
      date,
      items,
      amount: amountFor(items, pay !== "COD"),
      payment_method: pay,
      pincode: r.pick(PINCODES),
      predicted_return_prob: prob,
      status,
      window_closed: windowClosed,
      refund_amount: 0,
      kept_revenue: 0,
    };
    return o;
  };
  const settle = (o: Order) => {
    if (o.window_closed) {
      o.kept_revenue = o.status === "delivered" ? o.amount - o.refund_amount : 0;
    } else {
      o.kept_revenue = Math.round(o.amount * (1 - o.predicted_return_prob));
    }
  };
  const markBad = (o: Order) => {
    if (o.payment_method === "COD") {
      o.status = "RTO";
      o.refund_amount = 0;
    } else {
      o.status = r.chance(0.85) ? "returned" : "refunded";
      o.refund_amount = o.amount;
    }
  };

  // chatgpt cells: create orders per (arm, ad group), allocate bad outcomes per arm, then tune each cell
  for (const arm of ["A", "B", "C"] as const) {
    const cells: { orders: Order[]; target: number; cands: string[] }[] = [];
    for (const ag of Object.keys(CHATGPT_SESSIONS)) {
      const cell = sessions.filter((s) => s.channel === "chatgpt_ads" && s.ad_group_id === ag && s.arm === arm);
      const group = adGroups.ad_groups.find((g) => g.id === ag)!;
      const cands = group.candidate_skus.filter(sellable);
      const target = CELL_TARGETS[arm][ag] * cell.length;
      const avg = cands.reduce((s, h) => s + priceOf(h), 0) / cands.length;
      const n = Math.max(1, Math.round(target / (avg * (1 - BAD_RATE[arm]))));
      // chat sessions convert better in C
      const chatters = r.shuffle(cell.filter((s) => s.chat_opened));
      const rest = r.shuffle(cell.filter((s) => !s.chat_opened));
      const nChat = arm === "C" ? Math.min(chatters.length, Math.round(n * 0.4)) : 0;
      const buyers = [...chatters.slice(0, nChat), ...rest.slice(0, n - nChat)];
      const cellOrders = buyers.map((s) => {
        s.converted = true;
        const hero = r.chance(0.45) ? group.hero_sku : r.pick(cands);
        return makeOrder(s, [hero], ARM_RETURN_FACTOR[arm]);
      });
      cells.push({ orders: cellOrders, target, cands });
    }
    // bad outcomes so that (final bad + Σ predicted open) / n ≈ BAD_RATE for the arm
    const armOrders = cells.flatMap((c) => c.orders);
    const openP = armOrders.filter((o) => !o.window_closed).reduce((s, o) => s + o.predicted_return_prob, 0);
    const finals = armOrders.filter((o) => o.window_closed);
    // Small arms are lumpy (one return ≈ 9pp in arm A), so pick the bad count that needs the smallest
    // calibration of the open orders' predicted probabilities, then apply that calibration.
    const want = BAD_RATE[arm] * armOrders.length;
    const options = [Math.floor(want - openP), Math.ceil(want - openP)].map((nb) => Math.max(0, Math.min(finals.length, nb)));
    const scaleFor = (nb: number) => (openP > 0 ? Math.min(1.6, Math.max(0.6, (want - nb) / openP)) : 1);
    const nBad = options.sort((a, b) => Math.abs(Math.log(scaleFor(a))) - Math.abs(Math.log(scaleFor(b))))[0];
    const scale = scaleFor(nBad);
    armOrders.filter((o) => !o.window_closed).forEach((o) => (o.predicted_return_prob = Math.round(o.predicted_return_prob * scale * 1000) / 1000));
    r.shuffle(finals).slice(0, nBad).forEach(markBad);
    armOrders.forEach(settle);
    for (const c of cells) tune(c.orders, c.target, c.cands);
    orders.push(...armOrders);
  }

  // other channels: whole catalogue
  const all = products.map((p) => p.handle).filter(sellable);
  for (const o of OTHER) {
    const pool = r.shuffle(sessions.filter((s) => s.channel === o.channel));
    const n = Math.round(o.n * o.cr);
    const chOrders = pool.slice(0, n).map((s) => {
      s.converted = true;
      const handles = r.chance(0.15) ? [r.pick(all), r.pick(all)] : [r.pick(all)];
      return makeOrder(s, [...new Set(handles)], 1);
    });
    const finals = chOrders.filter((x) => x.window_closed);
    const openP = chOrders.filter((x) => !x.window_closed).reduce((s, x) => s + x.predicted_return_prob, 0);
    const nBad = Math.max(0, Math.min(finals.length, Math.round(0.12 * chOrders.length - openP)));
    r.shuffle(finals).slice(0, nBad).forEach(markBad);
    chOrders.forEach(settle);
    orders.push(...chOrders);
  }
  orders.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order_id < b.order_id ? -1 : 1));

  /** Swap single items between candidate SKUs on good orders until kept revenue is closest to target. */
  function tune(cellOrders: Order[], target: number, cands: string[]) {
    const kept = () => cellOrders.reduce((s, o) => s + o.kept_revenue, 0);
    for (let pass = 0; pass < 6; pass++) {
      for (const o of cellOrders) {
        if (o.status !== "delivered" && o.status !== "in_transit") continue;
        const diff = target - kept();
        if (Math.abs(diff) < 60) return;
        let best: { h: string; delta: number } | null = null;
        const before = o.kept_revenue;
        for (const h of cands) {
          const items = [{ ...o.items[0], sku: h, variant_sku: byHandle.get(h)!.variants[0].sku, price_inr: priceOf(h) }];
          const amt = amountFor(items, o.payment_method !== "COD");
          const k = o.window_closed ? amt : Math.round(amt * (1 - o.predicted_return_prob));
          const delta = k - before;
          if (!best || Math.abs(diff - delta) < Math.abs(diff - best.delta)) best = { h, delta };
        }
        if (best && Math.abs(diff - best.delta) < Math.abs(diff)) {
          const h = best.h;
          o.items = [{ ...o.items[0], sku: h, variant_sku: byHandle.get(h)!.variants[0].sku, price_inr: priceOf(h) }];
          o.amount = amountFor(o.items, o.payment_method !== "COD");
          settle(o);
        }
      }
    }
  }

  // ── chat logs: attach each hand-written message to a real arm-C chat session ──
  const messages: { id: string; session_id: string; ad_group_id: string; timestamp: string; message: string; language: "en-IN" | "hi-Latn"; converted: boolean; unmet: boolean }[] = [];
  const themes: Record<string, string> = {};
  const pools: Record<string, Session[]> = {};
  for (const ag of Object.values(AG)) pools[ag] = r.shuffle(sessions.filter((s) => s.chat_opened && s.ad_group_id === ag));
  const used = new Set<string>();
  const cursor: Record<string, number> = {};
  const take = (ag: string, distinct: boolean): Session => {
    const pool = pools[ag];
    cursor[ag] = cursor[ag] ?? 0;
    for (let k = 0; k < pool.length; k++) {
      const s = pool[(cursor[ag] + k) % pool.length];
      if (!distinct || !used.has(s.session_id)) {
        cursor[ag] = (cursor[ag] + k + 1) % pool.length;
        used.add(s.session_id);
        return s;
      }
    }
    throw new Error(`no chat sessions left for ${ag}`);
  };
  let mid = 0;
  for (const [theme, list] of Object.entries(THEMES)) {
    for (const [text, hinglish, unmet, agKey] of list) {
      const s = take(AG[agKey], theme === "hypoallergenic");
      const id = `msg_${String(++mid).padStart(3, "0")}`;
      themes[id] = theme;
      const hh = String(r.int(9, 22)).padStart(2, "0"), mm = String(r.int(0, 59)).padStart(2, "0");
      messages.push({ id, session_id: s.session_id, ad_group_id: s.ad_group_id!, timestamp: `${s.date}T${hh}:${mm}:00+05:30`, message: text, language: hinglish ? "hi-Latn" : "en-IN", converted: s.converted, unmet });
    }
  }
  const shuffled = r.shuffle(messages).sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));

  return {
    ordersSessions: { generated_by: "scripts/seed/orders.ts", seed: SEED, period: { from: FROM, to: TO }, sessions, orders },
    chatLogs: { messages: shuffled },
    chatThemes: themes,
  };
}
