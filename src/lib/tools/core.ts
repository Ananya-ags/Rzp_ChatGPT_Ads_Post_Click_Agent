/**
 * Agent tools, pure functions over the data (rule 3: AI talks and decides; code computes and acts).
 * The same contract is used by the website agent, the eval runner and the demo cache builder.
 */
import type { AdGroup, Brand, BrandRules, Logistics, Offer, Product, ReturnsEntry, Shoppers } from "../schemas";
import { estimateDelivery, formatDay } from "../delivery";

export type ReturnsClassified = {
  skus: Record<string, {
    contexts: Record<string, {
      n_reasons: number;
      themes: { theme: string; label: string; count: number; share: number }[];
      top_theme: string;
      typical_quote: string;
      better_fit_sku: string | null;
      better_fit_reason: string | null;
    }>;
  }>;
};

export type Db = {
  brand: Brand;
  products: Product[];
  adGroups: AdGroup[];
  rules: BrandRules;
  offers: Offer[];
  logistics: Logistics;
  returns: ReturnsEntry[];
  shoppers: Shoppers;
  returnsClassified: ReturnsClassified | null;
  now: Date;
};

const price = (p: Product) => Number(p.variants[0].price);
const stock = (p: Product) => p.variants.reduce((s, v) => s + v.inventory_quantity, 0);
export const findProduct = (db: Db, sku: string) => db.products.find((p) => p.handle === sku) ?? null;

/** Verified facts only (brand-entered metafields). Null = unknown, never a claim. */
export function verifiedFacts(p: Product) {
  const j = p.metafields.jewellery;
  return {
    sku: p.handle,
    title: p.title,
    price_inr: price(p),
    compare_at_inr: p.variants[0].compare_at_price ? Number(p.variants[0].compare_at_price) : null,
    category: j.category,
    subtype: j.subtype,
    collection: j.collection,
    outer_diameter_mm: j.outer_diameter_mm,
    drop_length_mm: j.drop_length_mm,
    chain_length_cm: j.chain_length_cm,
    weight_g: j.weight_g,
    base_metal: j.base_metal,
    plating: j.plating,
    water_resistant: j.water_resistant,
    sweat_resistant: j.sweat_resistant,
    nickel_free: j.nickel_free,
    closure: j.closure,
    tone: j.tone,
    occasions: j.occasions,
    made_to_order: j.made_to_order,
    dispatch_days: j.dispatch_days,
    in_stock: stock(p) > 0,
    rating: j.rating,
    review_count: j.review_count,
    size_label: p.variants[0].option1,
  };
}

/* ───────────────────────── search_catalog ───────────────────────── */

export type SearchFilters = {
  category?: Product["metafields"]["jewellery"]["category"];
  subtype?: string;
  max_price_inr?: number;
  occasion?: string;
  water_resistant?: boolean;
  max_outer_diameter_mm?: number;
  min_outer_diameter_mm?: number;
  similar_to?: string;
  deliver_to_pincode?: string;
  deliver_by?: string; // YYYY-MM-DD
  exclude?: string[];
  limit?: number;
};

export function searchCatalog(db: Db, query: string, f: SearchFilters = {}) {
  const q = query.toLowerCase();
  const excluded = new Set([...(db.rules.excluded_skus.map((e) => e.sku)), ...(f.exclude ?? [])]);
  const ref = f.similar_to ? findProduct(db, f.similar_to) : null;
  const words = q.split(/\W+/).filter((w) => w.length > 2);
  const rows = db.products
    .filter((p) => !excluded.has(p.handle) && !p.metafields.jewellery.excluded)
    .filter((p) => {
      const j = p.metafields.jewellery;
      if (f.category && j.category !== f.category) return false;
      if (f.subtype && j.subtype !== f.subtype) return false;
      if (f.max_price_inr && price(p) > f.max_price_inr) return false;
      if (f.occasion && !j.occasions.includes(f.occasion as never)) return false;
      if (f.water_resistant !== undefined && j.water_resistant !== f.water_resistant) return false; // verified only
      if (f.max_outer_diameter_mm && (j.outer_diameter_mm ?? Infinity) > f.max_outer_diameter_mm) return false;
      if (f.min_outer_diameter_mm && (j.outer_diameter_mm ?? 0) < f.min_outer_diameter_mm) return false;
      return true;
    })
    .map((p) => {
      const j = p.metafields.jewellery;
      const hay = `${p.title} ${p.tags.join(" ")} ${j.occasions.join(" ")} ${j.style_tags.join(" ")} ${j.subtype} ${j.collection}`.toLowerCase();
      let score = words.reduce((s, w) => s + (hay.includes(w) ? 2 : 0), 0) + j.rating;
      if (ref) {
        const rj = ref.metafields.jewellery;
        if (rj.subtype === j.subtype) score += 4;
        if (rj.category === j.category) score += 2;
        if (rj.outer_diameter_mm && j.outer_diameter_mm) score -= Math.abs(rj.outer_diameter_mm - j.outer_diameter_mm) / 5;
        if (p.handle === ref.handle) score -= 100;
      }
      const delivery = f.deliver_to_pincode ? estimateDelivery(p, f.deliver_to_pincode, db.logistics, db.now, f.deliver_by ?? null) : null;
      return { p, score, delivery };
    })
    .filter((x) => !f.deliver_by || x.delivery?.meets_deadline)
    .sort((a, b) => b.score - a.score)
    .slice(0, f.limit ?? 5);
  return {
    query,
    filters: f,
    count: rows.length,
    results: rows.map(({ p, delivery }) => ({
      ...verifiedFacts(p),
      ...(delivery ? { arrives_on: delivery.arrives_on, arrives_label: formatDay(delivery.arrives_on), meets_deadline: delivery.meets_deadline } : {}),
    })),
  };
}

/* ───────────────────────── check_delivery ───────────────────────── */

export function checkDelivery(db: Db, sku: string, pincode: string, deadline?: string | null) {
  const p = findProduct(db, sku);
  if (!p) return { error: `Unknown SKU ${sku}` };
  if (!/^\d{6}$/.test(pincode)) return { error: "Pincode must be 6 digits" };
  const e = estimateDelivery(p, pincode, db.logistics, db.now, deadline ?? null);
  return { ...e, title: p.title, ships_label: formatDay(e.ships_on), arrives_label: formatDay(e.arrives_on), deadline: deadline ?? null };
}

/* ───────────────────────── get_offer ───────────────────────── */

export type CartLine = { sku: string; qty: number };
export type OfferContext = { first_order?: boolean; prepaid?: boolean; logged_in?: boolean; bank_card?: boolean; requested_discount_pct?: number; rto_risk?: "low" | "medium" | "high" };

export function cartSubtotal(db: Db, cart: CartLine[]) {
  return cart.reduce((s, l) => {
    const p = findProduct(db, l.sku);
    return s + (p ? price(p) * l.qty : 0);
  }, 0);
}

export function getOffer(db: Db, cart: CartLine[], ctx: OfferContext = {}) {
  const subtotal = cartSubtotal(db, cart);
  const caps = db.rules.offer_caps;
  const capInr = Math.min(Math.floor((subtotal * caps.max_pct) / 100), caps.max_flat_inr);
  const eligible: { id: string; label: string; amount: number; stackable: boolean; cofunded: boolean }[] = [];
  const ineligible: { id: string; reason: string }[] = [];
  for (const o of db.offers) {
    if (o.type === "wallet") continue;
    const el = o.eligibility;
    if (subtotal < el.min_cart_inr) { ineligible.push({ id: o.id, reason: `Cart below ₹${el.min_cart_inr}` }); continue; }
    if (el.first_order_only && !ctx.first_order) { ineligible.push({ id: o.id, reason: "First order only" }); continue; }
    if (el.prepaid_only && ctx.prepaid === false) { ineligible.push({ id: o.id, reason: "Prepaid only" }); continue; }
    if (o.id === "bank_offer" && !ctx.bank_card) { ineligible.push({ id: o.id, reason: "Needs a select bank card" }); continue; }
    // pay-online nudge: only for a logged-in customer the RTO model flags as high risk (never shown as a judgement)
    if (o.id === "prepaid_nudge" && !(ctx.logged_in && ctx.rto_risk === "high")) { ineligible.push({ id: o.id, reason: "Not offered to this customer" }); continue; }
    const amount = o.type === "percent" ? Math.min(Math.floor((subtotal * o.value) / 100), o.cap_inr ?? Infinity) : o.value;
    eligible.push({ id: o.id, label: o.label, amount, stackable: o.stackable, cofunded: o.cofunded });
  }
  // best combination: either the best non-stackable alone, or all stackables; then clamp to the cap
  const stackSum = eligible.filter((e) => e.stackable).reduce((s, e) => s + e.amount, 0);
  const bestSingle = eligible.filter((e) => !e.stackable).sort((a, b) => b.amount - a.amount)[0];
  const useStack = !bestSingle || stackSum >= bestSingle.amount;
  const applied = useStack ? eligible.filter((e) => e.stackable) : [bestSingle];
  const raw = applied.reduce((s, e) => s + e.amount, 0);
  const discount = Math.min(raw, capInr);
  const walletOffer = db.offers.find((o) => o.type === "wallet");
  const walletBalance = ctx.logged_in ? db.shoppers.tier3_demo.loyalty_wallet_inr : 0;
  const walletUsable = walletOffer ? Math.min(walletBalance, Math.floor(((subtotal - discount) * walletOffer.value) / 100)) : 0;
  const ship = subtotal >= db.brand.policies.free_shipping_threshold_inr ? 0 : db.brand.policies.shipping_fee_inr;
  const requested = ctx.requested_discount_pct ?? null;
  return {
    subtotal_inr: subtotal,
    applied: applied.map((a) => ({ id: a.id, label: a.label, amount_inr: a.amount })),
    discount_inr: discount,
    cap: { max_pct: caps.max_pct, max_flat_inr: caps.max_flat_inr, cap_inr_for_this_cart: capInr, clamped: raw > capInr },
    ineligible,
    wallet: { balance_inr: walletBalance, usable_inr: walletUsable, note: walletBalance ? "Loyalty wallet is stored value, not a discount" : null },
    shipping_inr: ship,
    total_inr: subtotal - discount - walletUsable + ship,
    requested_discount: requested === null ? null : { pct: requested, allowed: requested <= caps.max_pct && requested * subtotal / 100 <= capInr, message: `Discounts are set by the store and capped at ${caps.max_pct}% or ₹${caps.max_flat_inr}. The assistant cannot create or change them.` },
  };
}

/* ───────────────────────── get_return_insight ───────────────────────── */

const CONTEXT_WORDS: Record<string, string[]> = {
  office: ["office", "work", "meeting", "formal", "daily", "everyday office"],
  wedding: ["wedding", "sangeet", "shaadi", "reception", "mehendi"],
  gifting: ["gift"],
  everyday: ["everyday", "daily", "casual"],
  festive: ["festive", "diwali", "festival"],
};
export function normaliseContext(c: string): string {
  const s = c.toLowerCase();
  for (const [k, ws] of Object.entries(CONTEXT_WORDS)) if (ws.some((w) => s.includes(w))) return k;
  return s;
}

export function getReturnInsight(db: Db, sku: string, context: string) {
  const p = findProduct(db, sku);
  const e = db.returns.find((r) => r.sku === sku);
  if (!p || !e) return { error: `No return data for ${sku}` };
  const ctx = normaliseContext(context);
  const uc = e.by_use_context[ctx as keyof typeof e.by_use_context];
  const ctxRate = uc ? uc.returns / uc.units : null;
  const cls = db.returnsClassified?.skus[sku]?.contexts[ctx] ?? null;
  const overall = e.return_rate;
  // Guardrail: only surface when the shopper's use matches a context with elevated returns and a dominant reason.
  const relevant = !!(uc && ctxRate !== null && ctxRate >= Math.max(0.15, overall * 1.3) && cls && cls.themes[0]?.share >= 0.5);
  let keeper: null | { sku: string; title: string; share_of_keepers: number; kept_units: number; compared_with: string[] } = null;
  if (relevant && cls?.better_fit_sku) {
    const family = db.products.filter((x) => x.metafields.jewellery.collection === p.metafields.jewellery.collection && x.metafields.jewellery.subtype === p.metafields.jewellery.subtype);
    const kept = family.map((x) => ({ sku: x.handle, kept: db.returns.find((r) => r.sku === x.handle)?.by_use_context[ctx as "office"]?.kept ?? 0 }));
    const total = kept.reduce((s, k) => s + k.kept, 0);
    const bf = kept.find((k) => k.sku === cls.better_fit_sku);
    if (bf && total > 0) keeper = { sku: bf.sku, title: findProduct(db, bf.sku)!.title, share_of_keepers: Math.round((bf.kept / total) * 100) / 100, kept_units: bf.kept, compared_with: kept.map((k) => k.sku) };
  }
  return {
    sku,
    title: p.title,
    context: ctx,
    relevant,
    overall_return_rate: overall,
    context_return_rate: ctxRate === null ? null : Math.round(ctxRate * 1000) / 1000,
    context_units: uc?.units ?? 0,
    top_reason: cls ? { theme: cls.themes[0].theme, label: cls.themes[0].label, share: cls.themes[0].share, count: cls.themes[0].count, of: cls.n_reasons } : null,
    typical_quote: cls?.typical_quote ?? null,
    better_fit: relevant && cls?.better_fit_sku ? { sku: cls.better_fit_sku, title: findProduct(db, cls.better_fit_sku)?.title ?? cls.better_fit_sku, reason: cls.better_fit_reason } : null,
    keepers: keeper,
    size_note: p.metafields.jewellery.outer_diameter_mm ? { outer_diameter_mm: p.metafields.jewellery.outer_diameter_mm, drop_length_mm: p.metafields.jewellery.drop_length_mm } : null,
  };
}

/* ───────────────────────── get_rto_risk ───────────────────────── */

export function getRtoRisk(db: Db, pincode: string) {
  const row = db.logistics.rto_risk.find((r) => r.pincode === pincode);
  return row
    ? { pincode, risk: row.risk, score: row.score, prepay_nudge: row.risk === "high" ? row.prepay_nudge_text : null, note: "Used only to suggest prepaid; never shown as a judgement on the shopper." }
    : { pincode, risk: "low" as const, score: 0.1, prepay_nudge: null, note: "No history for this pincode; default low." };
}

/* ───────────────────────── handoff ───────────────────────── */

export function handoff(db: Db, reason: string) {
  return { routed: true, reason, message: db.rules.escalation.text, contact: db.rules.escalation.contact, hours: db.brand.support.hours };
}

/* ───────────────────────── create_checkout (totals; the order itself is created server-side) ───────────────────────── */

export function checkoutTotals(db: Db, cart: CartLine[], ctx: OfferContext & { cod?: boolean; gift_wrap?: boolean }) {
  const offer = getOffer(db, cart, { ...ctx, prepaid: !ctx.cod });
  const cod = ctx.cod ? db.brand.policies.cod_fee_inr : 0;
  const wrap = ctx.gift_wrap ? db.brand.policies.gift_wrap_inr : 0;
  return { ...offer, cod_fee_inr: cod, gift_wrap_inr: wrap, payable_inr: offer.total_inr + cod + wrap };
}
