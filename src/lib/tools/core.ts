/**
 * Agent tools, pure functions over the data (rule 3: AI talks and decides; code computes and acts).
 * The same contract is used by the website agent, the eval runner and the demo cache builder.
 */
import type { AdGroup, Brand, BrandRules, Enriched, Logistics, Offer, Policy, Product, ReturnsEntry, Shoppers } from "../schemas";
import { estimateDelivery, formatDay } from "../delivery";
import { MAX_PER_SKU } from "../view";

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
  /** knowledge base sections (data/policies.json); lookup_policy reads only these */
  policies?: Policy[];
  /** AI-extracted, unverified attributes (data/generated/enriched_catalogue.json): labelled, never claims */
  enriched?: Enriched | null;
};

const price = (p: Product) => Number(p.variants[0].price);
const stock = (p: Product) => p.variants.reduce((s, v) => s + v.inventory_quantity, 0);
export const findProduct = (db: Db, sku: string) => db.products.find((p) => p.handle === sku) ?? null;

/**
 * The one size a shopper is told, in cm, computed here so the agent never converts units:
 * earrings by diameter ("3cm across") or length ("4.8cm long"); chains by length; rings by size.
 */
export function sizeText(j: Product["metafields"]["jewellery"]): string | null {
  if (j.category === "earrings") return j.outer_diameter_cm ? `${j.outer_diameter_cm}cm across` : j.drop_length_cm ? `${j.drop_length_cm}cm long` : null;
  if (j.subtype === "pendant" && j.outer_diameter_cm && j.chain_length_cm) return `${j.outer_diameter_cm}cm pendant on a ${j.chain_length_cm}cm chain${j.extender_cm ? ` (+ ${j.extender_cm}cm extender)` : ""}`;
  if (j.chain_length_cm) return `${j.chain_length_cm}cm${j.extender_cm ? ` + ${j.extender_cm}cm extender` : ""}`;
  if (j.ring_size) return `ring sizes ${j.ring_size}`;
  if (j.adjustable) return j.width_cm ? `adjustable, ${j.width_cm}cm wide` : "adjustable";
  return j.outer_diameter_cm ? `${j.outer_diameter_cm}cm across` : null;
}

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
    outer_diameter_cm: j.outer_diameter_cm,
    drop_length_cm: j.drop_length_cm,
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
    size: sizeText(j), // quote this to shoppers (cm); the *_cm fields are for filters
  };
}

/* ───────────────────────── search_catalog ───────────────────────── */

/** Design context for semantic matching, not raw marketing copy or unverified benefit claims. */
export function catalogDesignIndex(db: Db) {
  const excluded = new Set(db.rules.excluded_skus.map((e) => e.sku));
  return db.products
    .filter((p) => !excluded.has(p.handle) && !p.metafields.jewellery.excluded)
    .map((p) => {
      const j = p.metafields.jewellery;
      return {
        sku: p.handle,
        title: p.title,
        category: j.category,
        subtype: j.subtype,
        styles: j.style_tags,
        occasions: j.occasions,
        stone: j.stone_type,
        photo_design_tags: (db.enriched?.skus[p.handle]?.visual_tags ?? [])
          .filter((v) => ["shape", "motif", "texture", "silhouette", "style"].includes(v.kind))
          .map((v) => v.tag),
      };
    });
}

export type SearchFilters = {
  category?: Product["metafields"]["jewellery"]["category"];
  subtype?: string;
  max_price_inr?: number;
  occasion?: string;
  water_resistant?: boolean;
  max_outer_diameter_cm?: number;
  min_outer_diameter_cm?: number;
  similar_to?: string;
  deliver_to_pincode?: string;
  deliver_by?: string; // YYYY-MM-DD
  exclude?: string[];
  base_metal?: string; // code-only filter (chips such as "Stainless steel earrings"); not offered to the model
  ranked_skus?: string[]; // semantic matches selected by the LLM from the catalogue index; [] means no match
  design_terms?: string[]; // explicit motifs, shapes or textures, checked against catalogue appearance evidence
  design_match?: "all" | "any";
  limit?: number;
};

const SEARCH_FILLER = new Set(["show", "me", "find", "some", "any", "a", "an", "the", "with", "and", "or", "for", "of", "in", "design", "style", "piece", "jewellery", "jewelry", "please"]);
const searchWords = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  .map((w) => w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w)
  .map((w) => w === "floral" ? "flower" : w === "gift" ? "gifting" : w);

export function catalogCategory(query: string): SearchFilters["category"] {
  const words = new Set(searchWords(query));
  const matches = (["earrings", "necklace", "ring", "bracelet"] as const).filter((category) => words.has(searchWords(category)[0]));
  return matches.length === 1 ? matches[0] : undefined;
}

export function searchCatalog(db: Db, query: string, f: SearchFilters = {}) {
  const requestedWords = new Set(searchWords(query));
  const ignoredDesignTerms = (f.design_terms ?? []).filter((term) => !searchWords(term).every((word) => requestedWords.has(word)));
  f = {
    ...f,
    category: f.category ?? catalogCategory(query),
    ...(f.design_terms ? { design_terms: f.design_terms.filter((term) => !ignoredDesignTerms.includes(term)) } : {}),
  };
  const excluded = new Set([...(db.rules.excluded_skus.map((e) => e.sku)), ...(f.exclude ?? [])]);
  const ref = f.similar_to ? findProduct(db, f.similar_to) : null;
  const ranked = f.ranked_skus ? new Map([...new Set(f.ranked_skus)].map((sku, index) => [sku, index])) : null;
  const words = searchWords(query).filter((w) => !SEARCH_FILLER.has(w));
  const designs = new Map(catalogDesignIndex(db).map((p) => [p.sku, p.photo_design_tags]));
  const rows = db.products
    .filter((p) => !excluded.has(p.handle) && !p.metafields.jewellery.excluded)
    .filter((p) => {
      const j = p.metafields.jewellery;
      if (f.category && j.category !== f.category) return false;
      if (f.subtype && j.subtype !== f.subtype) return false;
      if (f.base_metal && j.base_metal !== f.base_metal) return false;
      if (f.max_price_inr !== undefined && price(p) > f.max_price_inr) return false;
      if (f.occasion && !j.occasions.includes(f.occasion as never)) return false;
      if (f.water_resistant !== undefined && j.water_resistant !== f.water_resistant) return false; // verified only
      if (f.max_outer_diameter_cm && (j.outer_diameter_cm ?? Infinity) > f.max_outer_diameter_cm) return false;
      if (f.min_outer_diameter_cm && (j.outer_diameter_cm ?? 0) < f.min_outer_diameter_cm) return false;
      return true;
    })
    .map((p) => {
      const j = p.metafields.jewellery;
      const hay = new Set(searchWords(`${p.title} ${p.tags.join(" ")} ${j.occasions.join(" ")} ${j.style_tags.join(" ")} ${j.subtype} ${j.collection} ${j.stone_type} ${designs.get(p.handle)?.join(" ") ?? ""}`));
      const matches = words.filter((w) => hay.has(w)).length;
      const termMatches = (f.design_terms ?? []).map((term) => searchWords(term).every((w) => hay.has(w)));
      const designMatches = !termMatches.length || (f.design_match === "any" ? termMatches.some(Boolean) : termMatches.every(Boolean));
      let score = matches * 2 + j.rating;
      if (ref) {
        const rj = ref.metafields.jewellery;
        if (rj.subtype === j.subtype) score += 4;
        if (rj.category === j.category) score += 2;
        if (rj.outer_diameter_cm && j.outer_diameter_cm) score -= Math.abs(rj.outer_diameter_cm - j.outer_diameter_cm) / 0.5;
        if (p.handle === ref.handle) score -= 100;
      }
      const delivery = f.deliver_to_pincode ? estimateDelivery(p, f.deliver_to_pincode, db.logistics, db.now, f.deliver_by ?? null) : null;
      return { p, score, delivery, matches, designMatches };
    })
    .filter((x) => x.designMatches)
    .filter((x) => ranked ? ranked.has(x.p.handle) || !!f.design_terms?.length : x.matches === words.length)
    .filter((x) => !f.deliver_by || x.delivery?.meets_deadline)
    .sort((a, b) => {
      const rankA = ranked?.get(a.p.handle) ?? Infinity, rankB = ranked?.get(b.p.handle) ?? Infinity;
      return rankA !== rankB ? rankA - rankB : b.score - a.score;
    });
  const page = rows.slice(0, f.limit ?? 5);
  return {
    query,
    filters: f,
    count: page.length,
    total_matches: rows.length,
    has_more: rows.length > page.length,
    ignored_design_terms: ignoredDesignTerms,
    why: `${page.length} shown of ${rows.length} remaining catalogue match(es) for "${query || "(filters only)"}"${ranked ? "; semantic selection, constraints enforced in code" : ""}${ignoredDesignTerms.length ? `; unrequested hard design filters ignored: ${ignoredDesignTerms.join(", ")}` : ""}`,
    results: page.map(({ p, delivery }) => ({
      ...verifiedFacts(p),
      unverified: unverifiedFor(db, p.handle),
      ...(delivery ? { arrives_on: delivery.arrives_on, arrives_label: formatDay(delivery.arrives_on), meets_deadline: delivery.meets_deadline } : {}),
    })),
  };
}

/* ───────────────────────── check_delivery ───────────────────────── */

/**
 * Delivery date for a SKU to a pincode. With a deadline the item misses, it also returns `alternatives`: up to 3
 * similar pieces (same category and subtype, in stock, price within ±20%) that arrive by the deadline, found by
 * searchCatalog. Delivery rescue is computed here in code; the agent only explains it.
 */
export function checkDelivery(db: Db, sku: string, pincode: string, deadline?: string | null) {
  const p = findProduct(db, sku);
  if (!p) return { error: `Unknown SKU ${sku}`, why: `No product with SKU ${sku}` };
  if (!/^\d{6}$/.test(pincode)) return { error: "Pincode must be 6 digits" };
  const e = estimateDelivery(p, pincode, db.logistics, db.now, deadline ?? null);
  const base = { ...e, title: p.title, size: sizeText(p.metafields.jewellery), ships_label: formatDay(e.ships_on), arrives_label: formatDay(e.arrives_on), deadline: deadline ?? null };
  if (!deadline || e.meets_deadline !== false) return { ...base, alternatives: [], summary: deliverySummary(base, []), why: `Delivery computed in code for ${pincode}${deadline ? ` against ${deadline}` : ""}` };
  const j = p.metafields.jewellery, pr = price(p);
  const alternatives = searchCatalog(db, "", { similar_to: sku, category: j.category, subtype: j.subtype, deliver_to_pincode: pincode, deliver_by: deadline, limit: 20 })
    .results.filter((r) => r.sku !== sku && r.in_stock && !r.made_to_order && Math.abs(r.price_inr - pr) <= pr * 0.2)
    .slice(0, 3)
    .map((r) => ({ sku: r.sku, title: r.title, price_inr: r.price_inr, size: r.size, arrives_on: r.arrives_on!, arrives_label: r.arrives_label!, meets_deadline: true }));
  return { ...base, alternatives, summary: deliverySummary(base, alternatives), why: `Misses ${deadline}; ${alternatives.length} in-time alternative(s) found in code` };
}

/** The delivery facts as one plain sentence, written in code for the agent to quote (dates never come from the model). */
function deliverySummary(d: { title: string; arrives_label: string; city: string; deadline: string | null; meets_deadline: boolean | null }, alternatives: { title: string; size: string | null; price_inr: number; arrives_label: string }[]) {
  const verb = /s$/i.test(d.title) ? "arrive" : "arrives";
  if (!d.deadline || d.meets_deadline !== false) return `The ${d.title} ${verb} ${d.arrives_label} in ${d.city}${d.deadline ? `, in time for ${formatDay(d.deadline).replace(/^\w+, /, "")}` : ""}.`;
  const by = formatDay(d.deadline).replace(/^\w+, /, "");
  // size leads the name ("the 2.8cm Everyday Tube Hoop Earrings") so it stays attached when the agent quotes it
  const alts = alternatives.map((a) => `the ${a.size ? `${a.size.replace(/ (across|long)$/, "")} ` : ""}${a.title} arrive${/s$/i.test(a.title) ? "" : "s"} ${a.arrives_label}`); // prices are on the cards
  return `The ${d.title} ${verb} ${d.arrives_label} in ${d.city}, after the ${by} deadline.${alts.length ? ` In time: ${alts.join("; ")}.` : " Nothing similar arrives in time."}`;
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
  const selected = useStack ? eligible.filter((e) => e.stackable) : [bestSingle];
  const raw = selected.reduce((s, e) => s + e.amount, 0);
  const discount = Math.min(raw, capInr);
  // Preserve configured offer order; later offers can use only the remaining cap.
  let remainingDiscount = discount;
  const applied = selected.map((a) => {
    const amount = Math.min(a.amount, remainingDiscount);
    remainingDiscount -= amount;
    return { id: a.id, label: amount < a.amount ? "Offer adjusted to the store cap" : a.label, amount_inr: amount };
  }).filter((a) => a.amount_inr > 0);
  const walletOffer = db.offers.find((o) => o.type === "wallet");
  const walletBalance = ctx.logged_in ? db.shoppers.tier3_demo.loyalty_wallet_inr : 0;
  const walletUsable = walletOffer ? Math.min(walletBalance, Math.floor(((subtotal - discount) * walletOffer.value) / 100)) : 0;
  const ship = subtotal >= db.brand.policies.free_shipping_threshold_inr ? 0 : db.brand.policies.shipping_fee_inr;
  const requested = ctx.requested_discount_pct ?? null;
  return {
    why: `Offers computed in code; cap ${caps.max_pct}% / ₹${caps.max_flat_inr}${ctx.requested_discount_pct ? `; requested ${ctx.requested_discount_pct}% not allowed` : ""}`,
    subtotal_inr: subtotal,
    applied,
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
    why: relevant ? `Return reasons for ${p.title} in "${ctx}" are relevant (top theme matches)` : `Return data for ${p.title} in "${ctx}" isn't relevant; don't mention returns`,
    sku,
    title: p.title,
    context: ctx,
    relevant,
    // the verdict is computed here, not by the model: "not_ideal" means the reply must not open with yes / haan
    fit: relevant ? ("not_ideal" as const) : ("good" as const),
    overall_return_rate: overall,
    context_return_rate: ctxRate === null ? null : Math.round(ctxRate * 1000) / 1000,
    context_units: uc?.units ?? 0,
    top_reason: cls ? { theme: cls.themes[0].theme, label: cls.themes[0].label, share: cls.themes[0].share, count: cls.themes[0].count, of: cls.n_reasons } : null,
    typical_quote: cls?.typical_quote ?? null,
    better_fit: relevant && cls?.better_fit_sku ? { sku: cls.better_fit_sku, title: findProduct(db, cls.better_fit_sku)?.title ?? cls.better_fit_sku, reason: cls.better_fit_reason } : null,
    keepers: keeper,
    // the better-fit product, computed here: the agent leads with the honest answer, then offers this
    alternative: (() => {
      const altSku = keeper?.sku ?? (relevant ? cls?.better_fit_sku : null);
      const a = altSku ? findProduct(db, altSku) : null;
      if (!a) return null;
      const aj = a.metafields.jewellery;
      return { sku: a.handle, title: a.title, size: sizeText(aj), price_inr: price(a), base_metal: aj.base_metal, plating: aj.plating, weight_g: aj.weight_g, water_resistant: aj.water_resistant, made_to_order: aj.made_to_order, why: keeper ? `${Math.round(keeper.share_of_keepers * 100)}% of ${ctx} buyers who kept this style chose it` : cls?.better_fit_reason ?? "Better fit for this use" };
    })(),
    size_note: p.metafields.jewellery.outer_diameter_cm ? { outer_diameter_cm: p.metafields.jewellery.outer_diameter_cm, size: sizeText(p.metafields.jewellery) } : p.metafields.jewellery.drop_length_cm ? { drop_length_cm: p.metafields.jewellery.drop_length_cm, size: sizeText(p.metafields.jewellery) } : null,
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

export type HandoffKind = "human" | "medical" | "allergy" | "unknown";

/** "You can reach our care team at …" (for a person request, and after medical / allergy answers). */
export function careReach(db: Db) {
  return `You can reach our care team at ${db.brand.support.email}, and we'll get back to you within ${db.brand.support.reply.replace(/^within /, "")}.`;
}

/** Honest nickel answer from verified metafields (no hypoallergenic / nickel-free claims). */
export function nickelAnswer(page: Product): string {
  const j = page.metafields.jewellery;
  const metal = { "stainless steel": "stainless steel", "925 silver": "sterling silver", brass: "brass" }[j.base_metal];
  const finish = j.plating === "18k gold plating" ? "18K gold plating" : j.plating === "gold vermeil" ? "gold vermeil" : j.plating ?? "a gold-toned finish";
  const plural = /s$/i.test(page.title);
  return j.nickel_free === false
    ? `No. ${plural ? "They're" : "It's"} ${metal}, which has a little nickel, so we don't call ${plural ? "them" : "it"} hypoallergenic. If you have a nickel allergy, please check with your doctor first.`
    : `The brand hasn't confirmed this. ${plural ? "They're" : "It's"} ${metal} with ${finish}. If you have a nickel allergy, please check with your doctor first.`;
}

/**
 * Care routing. `message` is what the agent gives as written:
 * - human: a direct way to reach the team (not "I don't have that information")
 * - medical: no medical advice, the metal if a product is open, a doctor, then the care team
 * - allergy: the honest nickel answer, then the care team
 * - unknown: the care line for facts the tools can't answer
 */
export function handoff(db: Db, reason: string, kind: HandoffKind = "unknown", page: Product | null = null) {
  const metal = page ? `${page.title} ${/s$/i.test(page.title) ? "are" : "is"} ${({ "stainless steel": "stainless steel", "925 silver": "sterling silver", brass: "brass" } as Record<string, string>)[page.metafields.jewellery.base_metal]} with ${page.metafields.jewellery.plating === "18k gold plating" ? "18K gold plating" : page.metafields.jewellery.plating ?? "a gold-toned finish"}. ` : "";
  const message =
    kind === "human" ? careReach(db)
    : kind === "medical" ? `I can't give medical advice. ${metal ? `The ${metal}` : ""}Please check with your doctor first. ${careReach(db)}`
    : kind === "allergy" && page ? `${nickelAnswer(page)} ${careReach(db)}`
    : db.rules.escalation.text;
  return { routed: true, reason, kind, message, contact: db.brand.support.email, reply: db.brand.support.reply, why: `Care routing (${kind}): ${reason}` };
}

/* ───────────────────────── create_checkout (totals; the order itself is created server-side) ───────────────────────── */

export function checkoutTotals(db: Db, cart: CartLine[], ctx: OfferContext & { cod?: boolean; gift_wrap?: boolean }) {
  const offer = getOffer(db, cart, { ...ctx, prepaid: !ctx.cod });
  const cod = ctx.cod ? db.brand.policies.cod_fee_inr : 0;
  const wrap = ctx.gift_wrap ? db.brand.policies.gift_wrap_inr : 0;
  return { ...offer, cod_fee_inr: cod, gift_wrap_inr: wrap, payable_inr: offer.total_inr + cod + wrap };
}

/* ───────────────────────── claims gate ───────────────────────── */

/**
 * Only material descriptions reach the shopper agent. Proposed benefits and their source phrases stay in the
 * offline enrichment data for merchant review, so quoting the description cannot turn them into shopper claims.
 */
export function unverifiedFor(db: Db, sku: string) {
  return (db.enriched?.skus[sku]?.attributes ?? []).map((a) => {
    const material = a.attribute === "base_metal" || a.attribute === "plating";
    return {
      attribute: a.attribute,
      value: material && !a.vague ? a.value : null,
      label: a.vague ? "vague wording: unknown, never a claim" : material ? "from the description, not verified: describe as a material, never a benefit" : "unverified benefit: do not state, quote or paraphrase; use the verified product field",
      phrase: material ? a.source.phrase : null,
    };
  });
}

/* ───────────────────────── get_product_facts ───────────────────────── */

/** Raw care prose may claim water safety before the brand has verified it. */
export function verifiedCare(p: Product): string {
  return p.metafields.jewellery.water_resistant === true
    ? p.metafields.jewellery.care
    : "Keep dry and away from perfume. Wipe with a soft dry cloth after wear and store in the pouch.";
}

/** Verified facts and the size text for any product (by handle or title), plus labelled unverified attributes. */
export function getProductFacts(db: Db, skuOrName: string) {
  const q = skuOrName.toLowerCase().trim();
  const p =
    findProduct(db, skuOrName) ??
    db.products.find((x) => x.title.toLowerCase() === q) ??
    db.products.find((x) => x.title.toLowerCase().includes(q) || q.includes(x.title.toLowerCase().replace(/ earrings?| necklace| ring| bracelet/g, "").trim()));
  if (!p) return { found: false as const, query: skuOrName, why: `No product matches "${skuOrName}"` };
  const j = p.metafields.jewellery;
  const unverified = unverifiedFor(db, p.handle);
  return {
    found: true as const,
    ...verifiedFacts(p),
    size: sizeText(j),
    care: verifiedCare(p),
    anti_tarnish_warranty_months: j.anti_tarnish_warranty_months,
    unverified,
    why: `Verified catalogue fields for ${p.title}${unverified.length ? `; ${unverified.length} unverified attribute(s) labelled, not claims` : ""}`,
  };
}

/* ───────────────────────── lookup_policy ───────────────────────── */

/** Topic words → knowledge-base section ids (rules in code; no LLM). */
const POLICY_RULES: [RegExp, string][] = [
  [/\b(return(s|ed|ing)?|send (it |them )?back)\b/, "returns.window"],
  [/\b(tried|worn|wore|pierc|hygien|non[- ]?returnable|clearance|sale item)/, "returns.non_returnable"],
  [/\b(pick ?up|collect)/, "returns.pickup"],
  [/\brefund/, "refunds.timeline"],
  [/\b(exchange|swap|different size)/, "exchanges"],
  [/\bcancel/, "cancellation"],
  [/\b(shipping (charge|fee|cost)s?|delivery (charge|fee)s?|free shipping|shipping cost)/, "shipping.fees"],
  [/\b(dispatch|same[- ]day|cut-?off)/, "shipping.dispatch"],
  [/\b(how (long|many days)|delivery time)/, "shipping.delivery_times"],
  [/\btrack/, "shipping.tracking"],
  [/\b(change (my |the )?address|wrong address)/, "shipping.address_change"],
  [/\b(international|abroad|outside india|overseas|dubai|usa|u\.?s\.?|uk|singapore|nepal|canada|australia)\b/, "shipping.international"],
  [/\b(damag|broken|lost|missing|tamper)/, "shipping.damaged_or_lost"],
  [/\b(diwali|festive|holiday)/, "shipping.festive"],
  [/\b(payment|pay with|upi|card|emi|net ?banking)/, "payments.methods"],
  [/\b(cod|cash on delivery)\b/, "payments.cod"],
  [/\b(offer|discount|coupon|promo)/, "offers.terms"],
  [/\bwallet/, "offers.wallet"],
  [/\b(gift|wrap|note|message card)/, "gifting"],
  [/\b(packag|(?<!subscription )box|pouch)/, "packaging"],
  [/\b(real gold|solid gold|pure gold|hallmark|bis\b|resale|karat|carat)/, "product.authenticity"],
  [/\bdemi[- ]?fine/, "product.demi_fine"],
  [/\b(stone|diamond|zirconia|\bcz\b|pearl)/, "product.stones"],
  [/\b(warranty|guarantee|tarnish|fad(e|ing)|discolou?r)/, "warranty.anti_tarnish"],
  [/\b(warranty claim|claim (the|my|a) warranty|make a claim)/, "warranty.claim"],
  [/\b(clean|care for|polish|look after|store (it|them))/, "care.steel"],
  [/\b(ring size|size chart|ring sizes)/, "sizing.rings"],
  [/\b(necklace length|chain length|how long is the chain)/, "sizing.necklaces"],
  [/\b(bracelet size|wrist)/, "sizing.bracelets"],
  [/\b(earring size|how big are (the )?earrings)/, "sizing.earrings"],
  [/\b(engrav|custom|personali[sz]|resiz|repair)/, "services.customisation"],
  // a size we don't stock ("make a ring in size 18", "custom ring size") is a customisation question, not the size chart
  [/\b((make|made) (me )?(a|one|it)\b.{0,20}\bsize|in (ring )?size \d+|custom (ring )?sizes?)/, "services.customisation"],
  [/\b(bulk|wholesale|corporate|16 or more|bridesmaid)/, "services.bulk_orders"],
  [/\b(log ?in|account|sign in)/, "account.login"],
  [/\b(privacy|my data|personalis)/, "privacy.personalisation"],
  [/\b(are you (an? )?(ai|bot|robot|human|person))/, "assistant.disclosure"],
  [/\b(contact|email|support|care team|customer care)/, "support.contact"],
  [/\b(water|shower|swim|sweat|perfume)/, "materials.water_and_wear"],
  [/\b(allerg|sensitive|nickel|skin)/, "materials.skin_sensitivity"],
  [/\b(material|metal|steel|brass|silver|vermeil|plating)/, "materials.overview"],
  [/\b(store in|stores?\b|offline store|physical store|showroom|outlet|visit|in person|about cosmos|who are you)/, "company.about"],
];

/** Markdown section → plain text for the chat (no bold, bullets become sentences, table rows become "a: b"). */
const plainPolicy = (md: string) =>
  md
    .replace(/\*\*|`/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^\|?\s*-{3,}/.test(l))
    .map((l) => (l.startsWith("|") ? l.split("|").map((c) => c.trim()).filter(Boolean).join(": ") : l.replace(/^[-*]\s+/, "")))
    .join(" ")
    .slice(0, 1200);

/** A knowledge-base section for a topic (id or keywords). No match → found: false, and the agent gives the care line. */
export function lookupPolicy(db: Db, topic: string) {
  const all = db.policies ?? [];
  const t = topic.toLowerCase().trim();
  const exact = all.find((p) => p.id === t || t.includes(p.id));
  const scores = new Map<string, number>();
  if (!exact) for (const [re, id] of POLICY_RULES) if (re.test(t)) scores.set(id, (scores.get(id) ?? 0) + 1);
  const bestId = exact?.id ?? [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const p = bestId ? all.find((x) => x.id === bestId) : undefined;
  if (!p) return { found: false as const, topic, why: `No policy section matches "${topic}"; give the care line, never a guess` };
  return { found: true as const, id: p.id, title: p.title, version: p.version, last_updated: p.last_updated, text: plainPolicy(p.text), why: `Policy ${p.id} ${p.version} matched "${topic}"` };
}

/* ───────────────────────── add_to_bag ───────────────────────── */

/**
 * Adds a piece to the shopper's bag (the bag lives in the browser; the client sends it and applies the result).
 * Checks stock and the 15-per-item limit; above 15, returns the bulk-order line from the knowledge base.
 */
export function addToBag(db: Db, cart: CartLine[], sku: string, qty = 1) {
  const p = findProduct(db, sku);
  if (!p) return { added: false as const, reason: "unknown_product", why: `No product ${sku}` };
  const n = Math.max(1, Math.floor(qty || 1));
  const j = p.metafields.jewellery;
  const inBag = cart.find((l) => l.sku === sku)?.qty ?? 0;
  const want = inBag + n;
  if (want > MAX_PER_SKU) {
    const bulk = db.policies?.find((x) => x.id === "services.bulk_orders");
    return { added: false as const, reason: "bulk_order", title: p.title, requested: n, in_bag: inBag, max_per_item: MAX_PER_SKU, message: bulk ? plainPolicy(bulk.text) : `The bag allows up to ${MAX_PER_SKU} of the same item.`, why: `${want} would exceed the ${MAX_PER_SKU}-per-item limit` };
  }
  const available = j.made_to_order ? MAX_PER_SKU : stock(p);
  if (want > available) return { added: false as const, reason: "stock", title: p.title, available: Math.max(0, available - inBag), why: `Only ${available} in stock` };
  const next = inBag ? cart.map((l) => (l.sku === sku ? { ...l, qty: want } : l)) : [...cart, { sku, qty: n }];
  return { added: true as const, sku, title: p.title, qty: n, line_qty: want, price_inr: price(p), cart: next, bag_count: next.reduce((s2, l) => s2 + l.qty, 0), why: `Added ${n} × ${p.title} (now ${want} in the bag)` };
}

/* ───────────────────────── preferences ───────────────────────── */

export type { Preferences } from "../preferences";
