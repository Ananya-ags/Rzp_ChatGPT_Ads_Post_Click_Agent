import { searchCatalog, type Db } from "./tools/core";
import type { Preferences } from "./preferences";

export type RailItem = { sku: string; reason: string; pinned: boolean };
type RailOptions = {
  hero: string;
  candidates: string[];
  groupId?: string;
  ownedSkus?: string[];
  maxEarringCm?: number;
  pincode: string;
  size: number;
};

export function applyRailPreferences(db: Db, base: RailItem[], prefs: Preferences, options: RailOptions): RailItem[] {
  const allowed = new Set(options.candidates);
  const margin = { low: 0, medium: 1, high: 2 };
  const eligible = new Set(db.products.filter((p) => {
    const j = p.metafields.jewellery;
    return allowed.has(p.handle)
      && margin[j.margin_band] >= margin[db.rules.margin_floor_band]
      && (j.made_to_order || p.variants.some((v) => v.inventory_quantity > 0))
      && (options.maxEarringCm === undefined || j.category !== "earrings" || (j.outer_diameter_cm ?? j.drop_length_cm ?? 0) <= options.maxEarringCm);
  }).map((p) => p.handle));
  const ranked = [...new Set([...base.map((r) => r.sku), ...options.candidates])].filter((sku) => eligible.has(sku));
  const matches = searchCatalog(db, "", {
    ranked_skus: ranked,
    exclude: [options.hero, ...(options.ownedSkus ?? [])],
    max_price_inr: prefs.budget_max_inr,
    occasion: prefs.occasion,
    category: prefs.category,
    ...(prefs.deadline ? { deliver_by: prefs.deadline, deliver_to_pincode: options.pincode } : {}),
    limit: db.products.length,
  }).results;
  const styleMatches = new Set(prefs.style
    ? searchCatalog(db, prefs.style, { limit: db.products.length }).results.map((p) => p.sku)
    : []);
  matches.sort((a, b) => Number(styleMatches.has(b.sku)) - Number(styleMatches.has(a.sku)));
  const pins = options.groupId ? db.rules.pinned[options.groupId] ?? [] : [];
  const items: RailItem[] = matches.map((p) => ({
    sku: p.sku,
    pinned: pins.some((pin) => pin.sku === p.sku),
    reason: [
      prefs.budget_max_inr !== undefined ? `Under ₹${prefs.budget_max_inr.toLocaleString("en-IN")}` : null,
      prefs.occasion ? `For ${prefs.occasion}` : null,
      "arrives_label" in p ? `Arrives ${p.arrives_label}` : null,
      styleMatches.has(p.sku) ? "Matches your style preference" : null,
    ].filter(Boolean).join(" · "),
  }));
  const ordered = items.filter((item) => !item.pinned);
  for (const pin of [...pins].sort((a, b) => a.slot - b.slot)) {
    const item = items.find((r) => r.sku === pin.sku);
    if (item) ordered.splice(Math.min(pin.slot - 1, ordered.length), 0, item);
  }
  return ordered.slice(0, options.size);
}
