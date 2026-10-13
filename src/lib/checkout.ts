/**
 * Checkout quote, computed on the server only: the bag comes from the cosmos_bag cookie (SKU + qty), every price
 * from the catalogue, offers from getOffer (caps enforced in code), delivery from checkDelivery, RTO from
 * getRtoRisk. The browser never sends an amount. The same quote creates the Razorpay order.
 *
 * Simulated Magic Checkout features (labelled in the UI): phone recognition and saved address (the demo persona),
 * RTO-aware payment (a prepaid nudge for high risk; COD always stays available), the offers UI and COD.
 */
import "server-only";
import { getDb } from "./data";
import { checkDelivery, findProduct, getOffer, getRtoRisk, type CartLine } from "./tools/core";
import { MAX_PER_SKU } from "./view";
import type { Persona } from "./user";

export const BAG_COOKIE = "cosmos_bag";
/** Simulated coupon codes (none are real); anything else gets "That code isn't valid". */
const COUPONS: Record<string, { first_order: true }> = { WELCOME10: { first_order: true } };

/** The bag from the cookie: [[sku, qty], …], clamped to stock and the per-item cap. */
export function bagFromRequest(req: Request): CartLine[] {
  const raw = (req.headers.get("cookie") ?? "").match(/(?:^|;\s*)cosmos_bag=([^;]*)/)?.[1];
  let pairs: unknown = [];
  try {
    pairs = JSON.parse(decodeURIComponent(raw ?? "[]"));
  } catch {}
  const db = getDb();
  const out: CartLine[] = [];
  for (const pair of Array.isArray(pairs) ? pairs.slice(0, 30) : []) {
    if (!Array.isArray(pair)) continue;
    const p = findProduct(db, String(pair[0]));
    if (!p) continue;
    const j = p.metafields.jewellery;
    const stock = p.variants.reduce((s, v) => s + v.inventory_quantity, 0);
    const qty = Math.max(0, Math.min(Math.floor(Number(pair[1]) || 0), j.made_to_order ? MAX_PER_SKU : Math.min(stock, MAX_PER_SKU)));
    if (qty) out.push({ sku: p.handle, qty });
  }
  return out;
}

export type QuoteInput = {
  pincode: string | null;
  method: "online" | "cod";
  walletOn: boolean;
  bankCard: boolean;
  coupon: string | null;
  adGroupId: string | null;
  giftWrap?: boolean;
};

export function quote(cart: CartLine[], user: Persona | null, input: QuoteInput) {
  const db = getDb();
  const rzp = db.razorpay.magic_checkout_simulated;
  const pin = input.pincode && /^\d{6}$/.test(input.pincode) ? input.pincode : user?.address.pincode ?? "411038";
  const lines = cart.map((l) => {
    const p = findProduct(db, l.sku)!;
    const unit = Number(p.variants[0].price);
    return { sku: p.handle, title: p.title, qty: l.qty, unit_inr: unit, line_inr: unit * l.qty, care: p.metafields.jewellery.care, variant_id: String(p.variants[0].id ?? p.handle) };
  });

  // RTO: the pincode's risk, raised by the shopper's own history when known; internal only (never shown)
  const pinRisk = getRtoRisk(db, pin);
  const rank = { low: 0, medium: 1, high: 2 } as const;
  const risk = user && rank[user.rtoRisk] > rank[pinRisk.risk] ? user.rtoRisk : pinRisk.risk;

  const code = input.coupon?.trim().toUpperCase() || null;
  const coupon = code ? (COUPONS[code] ? { code, valid: true, message: "Code applied" } : { code, valid: false, message: "That code isn't valid" }) : null;
  const offerCtx = { logged_in: !!user, rto_risk: risk, bank_card: input.bankCard, first_order: !!(coupon?.valid && COUPONS[code!]?.first_order) };
  const online = getOffer(db, cart, { ...offerCtx, prepaid: true });
  const codOffer = getOffer(db, cart, { ...offerCtx, prepaid: false, bank_card: false });
  const wallet = (o: typeof online) => (user && input.walletOn ? o.wallet.usable_inr : 0);
  const wrap = input.giftWrap ? db.brand.policies.gift_wrap_inr : 0;
  const totalOf = (o: typeof online, cod: boolean) => o.subtotal_inr - o.discount_inr - wallet(o) + o.shipping_inr + wrap + (cod ? db.brand.policies.cod_fee_inr : 0);
  const onlineTotal = totalOf(online, false);
  const codTotal = totalOf(codOffer, true);
  const cod = input.method === "cod";
  const chosen = cod ? codOffer : online;
  const payable = cod ? codTotal : onlineTotal;

  // delivery: the slowest item sets the date
  const deliveries = lines.map((l) => checkDelivery(db, l.sku, pin)).filter((d): d is Extract<ReturnType<typeof checkDelivery>, { arrives_on: string }> => !("error" in d));
  const slowest = deliveries.reduce<(typeof deliveries)[number] | null>((a, b) => (!a || b.arrives_on > a.arrives_on ? b : a), null);

  const codEligible = online.subtotal_inr <= rzp.cod_eligibility.max_cart_inr;
  const nudge = risk === "high";
  const extra = online.applied.find((a) => a.id === "prepaid_nudge");

  return {
    lines,
    count: lines.reduce((s, l) => s + l.qty, 0),
    pincode: pin,
    city: slowest?.city ?? null,
    arrives_on: slowest?.arrives_on ?? null,
    arrives_label: slowest?.arrives_label ?? null,
    subtotal_inr: online.subtotal_inr,
    applied: chosen.applied,
    discount_inr: chosen.discount_inr,
    cap: online.cap,
    coupon,
    bank_offer: { available: online.subtotal_inr >= (db.offers.find((o) => o.id === "bank_offer")?.eligibility.min_cart_inr ?? Infinity), on: input.bankCard && !cod, label: db.offers.find((o) => o.id === "bank_offer")?.label ?? "" },
    wallet: { available: !!user, balance_inr: chosen.wallet.balance_inr, usable_inr: chosen.wallet.usable_inr, on: !!user && input.walletOn },
    shipping_inr: chosen.shipping_inr,
    cod_fee_inr: cod ? db.brand.policies.cod_fee_inr : 0,
    gift_wrap_inr: wrap,
    method: input.method,
    payable_inr: payable,
    online_payable_inr: onlineTotal,
    cod_payable_inr: codTotal,
    saved_inr: chosen.discount_inr + wallet(chosen),
    cod: { eligible: codEligible, fee_inr: db.brand.policies.cod_fee_inr, note: codEligible ? "Online offers don't apply to cash on delivery." : `Cash on delivery is available on orders up to ₹${rzp.cod_eligibility.max_cart_inr.toLocaleString("en-IN")}.` },
    // the nudge is shown, the reason never is
    prepaid_nudge: nudge ? { text: extra ? `Pay online, extra 5% off (−₹${extra.amount_inr.toLocaleString("en-IN")})` : pinRisk.prepay_nudge ?? `Pay online and save ₹${(codTotal - onlineTotal).toLocaleString("en-IN")}` } : null,
    emi_available: online.subtotal_inr > rzp.affordability.emi_min_inr, // "bags over ₹3,000": the bag value, as on the bag page
    // internal (server → order notes and the AI console), never rendered to the shopper
    _risk: risk,
    _pin_score: pinRisk.score,
  };
}
export type Quote = ReturnType<typeof quote>;

/** Shopper-safe view of a quote (drops the internal risk fields). */
export function publicQuote(q: Quote) {
  const { _risk, _pin_score, ...rest } = q;
  void _risk;
  void _pin_score;
  return rest;
}

/**
 * Kept-revenue prediction for the AI console, computed in code from returns data: each item's return probability
 * in its ad context (the ad group's rate, else the SKU's), and an RTO probability (COD: the pincode's / shopper's
 * risk score; prepaid: the SKU's RTO rate, as prepaid orders are rarely refused). Kept = paid − refunds − RTO.
 */
export function predictKept(q: Quote, adGroupId: string | null) {
  const db = getDb();
  const highScore = Math.max(...db.logistics.rto_risk.filter((r) => r.risk === "high").map((r) => r.score), 0);
  const items = q.lines.map((l) => {
    const r = db.returns.find((x) => x.sku === l.sku);
    const byAd = adGroupId ? r?.by_ad_group[adGroupId as keyof typeof r.by_ad_group] : undefined;
    const share = q.subtotal_inr ? l.line_inr / q.subtotal_inr : 0;
    return { sku: l.sku, qty: l.qty, paid_inr: Math.round(q.payable_inr * share), return_probability: Math.round((byAd?.return_rate ?? r?.return_rate ?? 0) * 1000) / 1000, rto_rate: r?.rto_rate ?? 0, source: byAd ? `returns.json by_ad_group.${adGroupId}` : "returns.json SKU rate" };
  });
  const rtoProb = q.method === "cod" ? (q._risk === "high" ? Math.max(q._pin_score, highScore) : q._pin_score) : Math.max(0, ...items.map((i) => i.rto_rate));
  const refunds = items.reduce((s, i) => s + i.paid_inr * i.return_probability, 0);
  const rto = q.payable_inr * rtoProb;
  return {
    items: items.map(({ rto_rate, ...i }) => (void rto_rate, i)),
    rto_probability: Math.round(rtoProb * 1000) / 1000,
    paid_inr: q.payable_inr,
    predicted_refunds_inr: Math.round(refunds),
    predicted_rto_inr: Math.round(rto),
    predicted_kept_revenue_inr: Math.round(q.payable_inr - refunds - rto),
  };
}

/**
 * Magic Checkout's line_items format (prices in paise), used in the order notes now and as order fields with Magic.
 * offer_price is what each unit actually costs after offers (the order amount spread over the lines in proportion
 * to their price, so shipping, wallet and fees are included), and line_items_total equals the order amount.
 */
export function lineItems(q: Quote) {
  const db = getDb();
  const amount = q.payable_inr * 100;
  const base = q.lines.map((l) => l.line_inr * 100);
  const sumBase = base.reduce((a, b) => a + b, 0) || 1;
  // per-unit offer price, rounded down; the leftover paise go to whole units (single-unit lines take any remainder)
  const unit = q.lines.map((l, i) => Math.floor((base[i] * amount) / sumBase / l.qty));
  let left = amount - unit.reduce((s, u, i) => s + u * q.lines[i].qty, 0);
  for (let pass = 0; pass < 2 && left > 0; pass++)
    q.lines.forEach((l, i) => {
      const add = Math.floor(left / l.qty);
      if (add > 0 && (pass === 1 || l.qty === 1)) {
        unit[i] += add;
        left -= add * l.qty;
      }
    });
  const items = q.lines.map((l, i) => ({ sku: l.sku, variant_id: l.variant_id, name: l.title, price: l.unit_inr * 100, offer_price: unit[i], tax_amount: 0, quantity: l.qty, product_url: `/p/${l.sku}`, image_url: db.manifest.products[l.sku]?.front.kind === "photo" ? `/${db.manifest.products[l.sku]?.front.file}` : "" }));
  return { line_items: items, line_items_total: amount };
}
