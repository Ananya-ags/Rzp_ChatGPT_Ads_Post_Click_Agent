/**
 * Hand-authored catalogue source. `npm run seed` expands this into data/catalogue/products.json
 * (Shopify products.json shape + metafields.jewellery). Prose is deliberately messy brand copy.
 *
 * Planted sets (see evals/planted_facts.json):
 *  - 18 SKUs waterproof only in prose (water_resistant: null)
 *  - 6 studs/huggies with titanium / surgical-steel posts only in prose (nickel_free/post_material: null)
 *  - 4 SKUs with vague wording ("gold-toned", "water friendly", "skin-safe for most")
 */
import type { Jewellery, Product } from "../../src/lib/schemas";

type Def = {
  handle: string;
  title: string;
  price: number;
  compare?: number;
  body: string;
  m: Partial<Jewellery> & Pick<Jewellery, "category" | "subtype" | "collection" | "base_metal" | "occasions" | "style_tags">;
  size: string; // option1 for single-variant products
  sizes?: string[]; // ring sizes -> one variant each
  inventory: number; // units on hand per variant; 100 by default (planted exceptions: made-to-order 0, near-out-of-stock 2, clearance 18)
  snippets?: [string, number, string][];
  tags?: string[];
};

const STEEL_PVD = { base_metal: "316L stainless steel", plating: "18k gold PVD", plating_microns: 1.0, lead_free: true, anti_tarnish_warranty_months: 12 } as const;
const BRASS_GOLD = { base_metal: "brass", plating: "18k gold plating", plating_microns: 0.5, lead_free: true, anti_tarnish_warranty_months: 6 } as const;

export const DEFS: Def[] = [
  /* ═════════════ EARRINGS (18) ═════════════ */
  {
    handle: "ciel-hoops-40mm", title: "Large Classic Hoop Earrings", price: 3299, compare: 3999, size: "40mm", inventory: 100,
    body: `<p><strong>Waterproof</strong> and <strong>18K gold plated</strong> stainless steel. The hoop that started it all ✨ Bold but easy to wear, and made for people who never take their earrings off.</p><p><strong>Size:</strong> 40mm across, sits about 42mm on the ear. A statement, but a relaxed one. Latch back, about 3.2g each.</p><p>12-month anti-tarnish warranty. Shower, gym, perfume, a wedding: all fine.</p>`,
    m: { ...STEEL_PVD, category: "earrings", subtype: "hoop", collection: "Classic Hoops", outer_diameter_mm: 40, inner_diameter_mm: 34, drop_length_mm: 42, width_mm: 3, thickness_mm: 3, weight_g: 6.4, post_material: "316L stainless steel", nickel_free: false, water_resistant: true, sweat_resistant: true, perfume_safe: true, closure: "latch back", shape: "round", finish: "polished", tone: "yellow gold", style_tags: ["classic", "statement"], occasions: ["everyday", "festive", "wedding guest", "gifting"], margin_band: "high", launch_date: "2025-11-20", rating: 4.4, review_count: 212 },
    snippets: [["Ritika S.", 5, "Wore them in the shower for a month straight, still the same gold."], ["Neha P.", 3, "Bigger than I expected tbh. Love them for weekends, too loud for my office."], ["Ananya K.", 5, "Got so many compliments at my cousin's sangeet. Super light for the size."]],
  },
  {
    handle: "ciel-hoops-30mm", title: "Medium Classic Hoop Earrings", price: 2999, compare: 3499, size: "30mm", inventory: 0, tags: ["made-to-order"],
    body: `<p><strong>Waterproof</strong> and <strong>18K gold plated</strong> stainless steel. Our classic hoop, sized down to 30mm (about 32mm on the ear), easy for long workdays.</p><p>Safe in the shower and at the gym. Latch back.</p><p><em>Made to order in small batches: dispatches 5 days after you order.</em> Worth the wait, promise.</p>`,
    m: { ...STEEL_PVD, category: "earrings", subtype: "hoop", collection: "Classic Hoops", outer_diameter_mm: 30, inner_diameter_mm: 25, drop_length_mm: 32, width_mm: 2.5, thickness_mm: 2.5, weight_g: 4.6, post_material: "316L stainless steel", nickel_free: false, water_resistant: true, sweat_resistant: true, perfume_safe: true, closure: "latch back", shape: "round", finish: "polished", tone: "yellow gold", style_tags: ["classic", "minimal"], occasions: ["everyday", "office", "gifting"], dispatch_days: 5, made_to_order: true, margin_band: "high", launch_date: "2025-11-20", rating: 4.7, review_count: 168 },
    snippets: [["Pooja M.", 5, "Perfect office size. I wear these 5 days a week."], ["Shruti D.", 5, "Exchanged my 40s for these, so much better for daily wear."], ["Kavya R.", 4, "Took a few days to ship since it's made to order, but lovely."]],
  },
  {
    handle: "ciel-huggies-20mm", title: "Classic Huggie Earrings", price: 2199, compare: 2599, size: "20mm", inventory: 100,
    body: `<p><strong>Waterproof</strong> and <strong>18K gold plated</strong> stainless steel. Our classic hoop, tiny: a 20mm huggie that hugs the lobe and clicks shut.</p><p>Comfortable enough to sleep in, neat enough for office meetings. About 2g each.</p>`,
    m: { ...STEEL_PVD, category: "earrings", subtype: "huggie", collection: "Classic Hoops", outer_diameter_mm: 20, inner_diameter_mm: 14, drop_length_mm: 20, width_mm: 3, thickness_mm: 3, weight_g: 4.0, post_material: "316L stainless steel", nickel_free: false, water_resistant: true, sweat_resistant: true, perfume_safe: true, closure: "hinged huggie", shape: "round", finish: "polished", tone: "yellow gold", style_tags: ["minimal", "layering"], occasions: ["everyday", "office", "gifting"], margin_band: "high", launch_date: "2025-08-01", rating: 4.6, review_count: 304 },
  },
  {
    handle: "aria-hoops-28mm", title: "Everyday Tube Hoop Earrings", price: 2799, compare: 3299, size: "28mm", inventory: 100,
    body: `<p><strong>Waterproof</strong> and <strong>18K gold plated</strong> stainless steel. The classic hoop's slightly chunkier cousin: a 28mm hoop with a softly rounded tube, about 30mm on the ear.</p><p>In stock and ready to ship from Jaipur.</p>`,
    m: { ...STEEL_PVD, category: "earrings", subtype: "hoop", collection: "Tube Hoops", outer_diameter_mm: 28, inner_diameter_mm: 23, drop_length_mm: 30, width_mm: 2.8, thickness_mm: 3.2, weight_g: 4.8, post_material: "316L stainless steel", nickel_free: false, water_resistant: true, sweat_resistant: true, perfume_safe: true, closure: "latch back", shape: "round", finish: "polished", tone: "yellow gold", style_tags: ["classic", "minimal"], occasions: ["everyday", "office", "gifting"], margin_band: "medium", launch_date: "2026-03-10", rating: 4.5, review_count: 97 },
  },
  {
    handle: "noor-kundan-jhumkas", title: "Kundan Jhumka Earrings", price: 3499, compare: 4299, size: "48mm drop", inventory: 100, tags: ["new"],
    body: `<p>NEW 🪔 <strong>18K gold plated</strong> brass with handset kundan stones. Our first kundan jhumka: big enough for the baraat, light enough to dance in.</p><p>About 48mm long. Push back. Keep away from water and perfume, and store in the pouch.</p>`,
    m: { ...BRASS_GOLD, category: "earrings", subtype: "jhumka", collection: "Jhumkas", drop_length_mm: 48, width_mm: 22, weight_g: 14, water_resistant: false, sweat_resistant: false, perfume_safe: false, closure: "push back", stone_type: "kundan", setting: "kundan", stone_count: 18, shape: "bell", finish: "textured", tone: "yellow gold", style_tags: ["ethnic fusion", "statement"], occasions: ["festive", "wedding guest", "gifting"], margin_band: "high", pinned: true, launch_date: "2026-10-01", rating: 4.8, review_count: 26 },
  },
  {
    handle: "noor-pearl-jhumkas", title: "Pearl Fringe Jhumka Earrings", price: 2499, compare: 2999, size: "40mm drop", inventory: 100,
    body: `<p><strong>18K gold plated</strong> brass with a shell-pearl fringe. A classic jhumka, done light, about 40mm long.</p><p>For mehendi, haldi, Diwali card parties... you get it. Wipe after wear and keep dry.</p>`,
    m: { ...BRASS_GOLD, category: "earrings", subtype: "jhumka", collection: "Jhumkas", drop_length_mm: 40, width_mm: 18, weight_g: 11, water_resistant: false, sweat_resistant: false, perfume_safe: false, closure: "push back", stone_type: "pearl", setting: "fringe", stone_count: 24, shape: "bell", finish: "polished", tone: "yellow gold", style_tags: ["ethnic fusion"], occasions: ["festive", "wedding guest", "gifting"], margin_band: "medium", launch_date: "2026-01-15", rating: 4.5, review_count: 141 },
  },
  {
    handle: "noor-mini-jhumkas", title: "Mini Jhumka Earrings", price: 1799, size: "28mm drop", inventory: 100,
    body: `<p><strong>18K gold plated</strong> brass. Small jhumkas for big days and regular ones, about 28mm long. Office pe bhi chal jayenge 😉</p><p>Keep dry and store separately.</p>`,
    m: { ...BRASS_GOLD, category: "earrings", subtype: "jhumka", collection: "Jhumkas", drop_length_mm: 28, width_mm: 12, weight_g: 6, water_resistant: false, sweat_resistant: false, perfume_safe: false, closure: "push back", shape: "bell", finish: "textured", tone: "yellow gold", style_tags: ["ethnic fusion", "minimal"], occasions: ["festive", "office", "gifting"], margin_band: "medium", launch_date: "2025-09-05", rating: 4.4, review_count: 88 },
  },
  {
    handle: "noor-temple-jhumkas", title: "Temple Jhumka Earrings", price: 4299, compare: 4999, size: "55mm drop", inventory: 100,
    body: `<p><strong>Gold vermeil</strong>: thick gold over sterling silver, with hand-finished temple motifs. About 55mm long. The heirloom look, without the heirloom price.</p><p>Store in the box and keep away from water.</p>`,
    m: { base_metal: "925 silver", plating: "gold vermeil", plating_microns: 2.5, lead_free: true, anti_tarnish_warranty_months: 6, category: "earrings", subtype: "jhumka", collection: "Jhumkas", drop_length_mm: 55, width_mm: 24, weight_g: 18, water_resistant: false, sweat_resistant: false, perfume_safe: false, closure: "hook", shape: "bell", finish: "textured", tone: "yellow gold", style_tags: ["ethnic fusion", "statement"], occasions: ["festive", "wedding guest"], margin_band: "high", launch_date: "2025-10-10", rating: 4.6, review_count: 63 },
  },
  // ─── hypoallergenic posts mentioned only in prose (6) ───
  {
    handle: "tara-solitaire-studs", title: "Classic Solitaire Stud Earrings", price: 1499, size: "6mm", inventory: 100,
    body: `<p><strong>18K gold plated</strong>, with one perfect sparkle: a 6mm American diamond in a four-prong setting. Crafted on surgical-grade titanium posts so even sensitive lobes can wear them all day.</p><p>Push back. Small, everyday, easy to gift.</p>`,
    m: { ...BRASS_GOLD, category: "earrings", subtype: "stud", collection: "Studs", outer_diameter_mm: 6, drop_length_mm: 6, weight_g: 1.6, water_resistant: false, closure: "push back", stone_type: "CZ / American diamond", setting: "four-prong", stone_count: 2, shape: "round", finish: "polished", tone: "yellow gold", style_tags: ["minimal", "classic"], occasions: ["everyday", "office", "gifting"], margin_band: "medium", launch_date: "2025-06-12", rating: 4.5, review_count: 233 },
  },
  {
    handle: "tara-pearl-studs", title: "Classic Pearl Stud Earrings", price: 1299, size: "7mm", inventory: 100,
    body: `<p><strong>18K gold plated</strong> studs with a 7mm shell pearl, crafted on surgical-grade titanium posts. Mom-approved, office-approved, first-date approved.</p>`,
    m: { ...BRASS_GOLD, category: "earrings", subtype: "stud", collection: "Studs", outer_diameter_mm: 7, drop_length_mm: 7, weight_g: 2.0, water_resistant: false, closure: "push back", stone_type: "pearl", setting: "cup", stone_count: 2, shape: "round", finish: "polished", tone: "yellow gold", style_tags: ["minimal", "classic"], occasions: ["everyday", "office", "gifting"], margin_band: "medium", launch_date: "2025-06-12", rating: 4.6, review_count: 189 },
  },
  {
    handle: "tara-heart-studs", title: "Heart Stud Earrings", price: 1199, size: "8mm", inventory: 100,
    body: `<p><strong>18K gold plated</strong> little hearts, 8mm, on titanium posts that are kind to sensitive ears. An easy gift for your bestie (or yourself).</p>`,
    m: { ...BRASS_GOLD, category: "earrings", subtype: "stud", collection: "Studs", outer_diameter_mm: 8, drop_length_mm: 8, weight_g: 1.4, water_resistant: false, closure: "push back", shape: "heart", finish: "polished", tone: "yellow gold", style_tags: ["minimal"], occasions: ["everyday", "gifting"], margin_band: "medium", launch_date: "2026-02-01", rating: 4.3, review_count: 74 },
  },
  {
    handle: "elle-bezel-studs", title: "Mini Bezel Stud Earrings", price: 1699, size: "5mm", inventory: 100,
    body: `<p><strong>Gold vermeil</strong> on sterling silver, with a 5mm American diamond in a clean bezel. Set on surgical-steel posts, friendly for sensitive ears. Sleek enough to never take off.</p>`,
    m: { base_metal: "925 silver", plating: "gold vermeil", plating_microns: 2.5, lead_free: true, anti_tarnish_warranty_months: 6, category: "earrings", subtype: "stud", collection: "Bezel Studs", outer_diameter_mm: 5, drop_length_mm: 5, weight_g: 1.2, closure: "push back", stone_type: "CZ / American diamond", setting: "bezel", stone_count: 2, shape: "round", finish: "polished", tone: "yellow gold", style_tags: ["minimal"], occasions: ["everyday", "office"], margin_band: "high", launch_date: "2025-12-01", rating: 4.6, review_count: 58 },
  },
  {
    handle: "kira-mini-huggies", title: "Mini Huggie Earrings", price: 1899, size: "12mm", inventory: 100,
    body: `<p><strong>Waterproof</strong> and <strong>18K gold plated</strong> stainless steel. 12mm huggies crafted on surgical-grade titanium posts. Shower in them, sleep in them, just leave them in.</p>`,
    m: { ...STEEL_PVD, category: "earrings", subtype: "huggie", collection: "Huggies", outer_diameter_mm: 12, inner_diameter_mm: 8, drop_length_mm: 12, width_mm: 2, thickness_mm: 2, weight_g: 2.2, closure: "hinged huggie", shape: "round", finish: "polished", tone: "yellow gold", style_tags: ["minimal", "layering"], occasions: ["everyday", "office"], margin_band: "medium", launch_date: "2026-01-20", rating: 4.5, review_count: 112 },
  },
  {
    handle: "kira-twist-huggies", title: "Twisted Huggie Earrings", price: 2099, size: "14mm", inventory: 100,
    body: `<p><strong>Waterproof</strong> and <strong>18K gold plated</strong> stainless steel. A twisted rope texture on a 14mm huggie, set on titanium posts. These go in the pool with you, no drama.</p>`,
    m: { ...STEEL_PVD, category: "earrings", subtype: "huggie", collection: "Huggies", outer_diameter_mm: 14, inner_diameter_mm: 9, drop_length_mm: 14, width_mm: 3, thickness_mm: 3, weight_g: 2.8, closure: "hinged huggie", shape: "round", finish: "textured", tone: "yellow gold", style_tags: ["minimal", "layering"], occasions: ["everyday", "gifting"], margin_band: "medium", launch_date: "2026-01-20", rating: 4.4, review_count: 61 },
  },
  // ─── other drops / studs ───
  {
    handle: "mira-pearl-drops", title: "Pearl Drop Earrings", price: 2299, size: "35mm drop", inventory: 100,
    body: `<p><strong>18K gold plated</strong> brass. A single freshwater-style pearl swinging from a tiny gold bar, about 35mm long. Water friendly-ish for a quick wash, but treat her gently.</p>`,
    m: { base_metal: "brass", plating: "18k gold plating", plating_microns: 0.5, lead_free: null, anti_tarnish_warranty_months: 6, category: "earrings", subtype: "drop", collection: "Drops", drop_length_mm: 35, weight_g: 3.4, closure: "hook", stone_type: "pearl", setting: "peg", stone_count: 2, shape: "drop", finish: "polished", tone: "yellow gold", style_tags: ["classic"], occasions: ["office", "festive", "wedding guest", "gifting"], margin_band: "medium", launch_date: "2025-07-07", rating: 4.3, review_count: 85 },
  },
  {
    handle: "mira-teardrop-drops", title: "Teardrop Earrings", price: 1999, size: "30mm drop", inventory: 100,
    body: `<p><strong>Waterproof</strong> and <strong>18K gold plated</strong> stainless steel. Polished teardrops, about 30mm long and featherlight. Brunch to boardroom.</p>`,
    m: { ...STEEL_PVD, category: "earrings", subtype: "drop", collection: "Drops", drop_length_mm: 30, width_mm: 12, weight_g: 3.0, closure: "push back", shape: "teardrop", finish: "polished", tone: "yellow gold", style_tags: ["minimal"], occasions: ["everyday", "office", "gifting"], margin_band: "medium", launch_date: "2026-04-02", rating: 4.4, review_count: 52 },
  },
  {
    handle: "sana-chain-threaders", title: "Chain Threader Earrings", price: 1599, size: "60mm drop", inventory: 100,
    body: `<p><strong>Waterproof</strong> and <strong>18K gold plated</strong> stainless steel. Threader earrings with a fine chain, about 60mm long. Swim, sweat, repeat.</p>`,
    m: { ...STEEL_PVD, category: "earrings", subtype: "drop", collection: "Threaders", drop_length_mm: 60, weight_g: 1.8, closure: "slip-on", shape: "linear", finish: "polished", tone: "yellow gold", style_tags: ["minimal", "layering"], occasions: ["everyday", "festive"], margin_band: "medium", launch_date: "2026-05-15", rating: 4.2, review_count: 39 },
  },
  {
    handle: "lia-flower-studs", title: "Flower Stud Earrings", price: 999, size: "10mm", inventory: 100,
    body: `<p>Cute little flowers, 10mm, with a gold-toned finish. Pretty for every day, and an easy gift under a thousand.</p>`,
    m: { base_metal: "brass", plating: null, plating_microns: null, lead_free: null, anti_tarnish_warranty_months: null, category: "earrings", subtype: "stud", collection: "Florals", outer_diameter_mm: 10, drop_length_mm: 10, weight_g: 1.5, closure: "push back", shape: "flower", finish: "polished", tone: "yellow gold", style_tags: ["minimal"], occasions: ["everyday", "gifting"], margin_band: "low", launch_date: "2025-05-01", rating: 4.0, review_count: 120 },
  },

  /* ═════════════ NECKLACES (8) ═════════════ */
  {
    handle: "sol-paperclip-chain", title: "Paperclip Chain Necklace", price: 2499, compare: 2999, size: "45cm + 5cm", inventory: 100,
    body: `<p><strong>Waterproof</strong> and <strong>18K gold plated</strong> stainless steel. The paperclip chain everyone's been asking for: 45cm with a 5cm extender.</p><p>Wear it alone or layer it with other chains.</p>`,
    m: { ...STEEL_PVD, category: "necklace", subtype: "chain", collection: "Chains", chain_length_cm: 45, extender_cm: 5, width_mm: 4, weight_g: 7, closure: "lobster clasp", shape: "paperclip", finish: "polished", tone: "yellow gold", style_tags: ["minimal", "layering"], occasions: ["everyday", "office"], margin_band: "high", launch_date: "2025-09-15", rating: 4.5, review_count: 140 },
  },
  {
    handle: "sol-snake-chain", title: "Snake Chain Necklace", price: 2799, size: "42cm + 5cm", inventory: 100,
    body: `<p><strong>Waterproof</strong> and <strong>18K gold plated</strong> stainless steel. A smooth, liquid-gold snake chain, 42cm with a 5cm extender. Goes in the pool with you and comes out shining.</p>`,
    m: { ...STEEL_PVD, category: "necklace", subtype: "chain", collection: "Chains", chain_length_cm: 42, extender_cm: 5, width_mm: 3, weight_g: 9, closure: "lobster clasp", shape: "snake", finish: "polished", tone: "yellow gold", style_tags: ["minimal", "classic"], occasions: ["everyday", "office", "festive"], margin_band: "high", launch_date: "2025-12-10", rating: 4.4, review_count: 77 },
  },
  {
    handle: "sol-rope-chain", title: "Rope Chain Necklace", price: 1899, size: "40cm + 5cm", inventory: 100,
    body: `<p><strong>Waterproof</strong> and <strong>18K gold plated</strong> stainless steel. A twisted rope chain, 40cm with a 5cm extender: the base of every stack.</p>`,
    m: { ...STEEL_PVD, category: "necklace", subtype: "chain", collection: "Chains", chain_length_cm: 40, extender_cm: 5, width_mm: 2, weight_g: 5, closure: "lobster clasp", shape: "rope", finish: "textured", tone: "yellow gold", style_tags: ["minimal", "layering"], occasions: ["everyday"], margin_band: "medium", launch_date: "2025-09-15", rating: 4.3, review_count: 66 },
  },
  {
    handle: "sol-layered-chain-set", title: "Layered Chain Necklace Set", price: 3999, compare: 4799, size: "40/45/50cm", inventory: 100,
    body: `<p><strong>Waterproof</strong> and <strong>18K gold plated</strong> stainless steel. Three chains, pre-layered on one clasp: 40, 45 and 50cm, so the stack sits right every time (no more untangling at 8am... mostly).</p>`,
    m: { ...STEEL_PVD, category: "necklace", subtype: "layered set", collection: "Chains", chain_length_cm: 50, extender_cm: 5, width_mm: 2, weight_g: 14, closure: "lobster clasp", shape: "layered", finish: "polished", tone: "yellow gold", style_tags: ["layering", "statement"], occasions: ["everyday", "office", "festive"], margin_band: "high", launch_date: "2025-10-25", rating: 4.1, review_count: 176 },
    snippets: [["Divya A.", 3, "Pretty but the longest one is too long with my work shirts."], ["Megha T.", 4, "Looks expensive. Tangles a bit in my bag."], ["Ira S.", 5, "Wore it to every Diwali party, so many compliments."]],
  },
  {
    handle: "luna-coin-pendant", title: "Sun Coin Pendant Necklace", price: 2299, size: "45cm", inventory: 100,
    body: `<p><strong>Waterproof</strong> and <strong>18K gold plated</strong> stainless steel. A 15mm sun-ray coin on a fine 45cm chain. Wear it alone or stack it with our chains.</p>`,
    m: { ...STEEL_PVD, category: "necklace", subtype: "pendant", collection: "Pendants", outer_diameter_mm: 15, chain_length_cm: 45, extender_cm: 5, weight_g: 5, closure: "lobster clasp", shape: "coin", finish: "textured", tone: "yellow gold", style_tags: ["minimal", "layering"], occasions: ["everyday", "office", "gifting"], margin_band: "high", launch_date: "2025-06-01", rating: 4.6, review_count: 131 },
  },
  {
    handle: "luna-evil-eye-pendant", title: "Evil Eye Pendant Necklace", price: 1799, size: "45cm", inventory: 100,
    body: `<p><strong>Waterproof</strong> and <strong>18K gold plated</strong> stainless steel. Nazar na lage 🧿 A tiny enamel evil eye on a 45cm chain. Swim-safe.</p>`,
    m: { ...STEEL_PVD, category: "necklace", subtype: "pendant", collection: "Pendants", outer_diameter_mm: 9, chain_length_cm: 45, extender_cm: 5, weight_g: 4, closure: "lobster clasp", shape: "eye", finish: "polished", tone: "yellow gold", style_tags: ["minimal"], occasions: ["everyday", "gifting"], margin_band: "medium", launch_date: "2026-02-14", rating: 4.5, review_count: 94 },
  },
  {
    handle: "luna-heart-pendant", title: "Heart Pendant Necklace", price: 1599, size: "42cm", inventory: 2,
    body: `<p><strong>Waterproof</strong> and <strong>18K gold plated</strong> stainless steel. A 10mm puffed heart on a 42cm chain, and very giftable. Almost gone!</p>`,
    m: { ...STEEL_PVD, category: "necklace", subtype: "pendant", collection: "Pendants", outer_diameter_mm: 10, chain_length_cm: 42, extender_cm: 5, weight_g: 4, closure: "lobster clasp", shape: "heart", finish: "polished", tone: "yellow gold", style_tags: ["minimal"], occasions: ["everyday", "gifting"], margin_band: "medium", excluded: true, launch_date: "2025-02-01", rating: 4.4, review_count: 210 },
  },
  {
    handle: "maya-pearl-choker", title: "Pearl Choker Necklace", price: 3299, compare: 3899, size: "35cm + 7cm", inventory: 100,
    body: `<p><strong>18K gold plated</strong> chain with graduated shell pearls, 35cm with a 7cm extender. Skin-safe for most, and pretty much made for lehengas and sarees.</p>`,
    m: { base_metal: "brass", plating: "18k gold plating", plating_microns: 0.5, lead_free: null, anti_tarnish_warranty_months: 6, category: "necklace", subtype: "choker", collection: "Pearls", chain_length_cm: 35, extender_cm: 7, weight_g: 22, closure: "lobster clasp", stone_type: "pearl", setting: "strung", stone_count: 31, shape: "graduated", finish: "polished", tone: "yellow gold", style_tags: ["statement", "ethnic fusion"], occasions: ["festive", "wedding guest", "gifting"], margin_band: "medium", launch_date: "2025-10-01", rating: 4.5, review_count: 47 },
  },

  /* ═════════════ RINGS (5) ═════════════ */
  {
    handle: "veda-dome-ring", title: "Dome Ring", price: 1499, size: "Adjustable", inventory: 100,
    body: `<p><strong>Waterproof</strong> and <strong>18K gold plated</strong> stainless steel. A chunky polished dome that adjusts to fit roughly sizes 5 to 9.</p>`,
    m: { ...STEEL_PVD, category: "ring", subtype: "band", collection: "Rings", width_mm: 8, weight_g: 4, adjustable: true, closure: "adjustable", shape: "dome", finish: "polished", tone: "yellow gold", style_tags: ["statement"], occasions: ["everyday", "festive"], margin_band: "high", launch_date: "2026-03-01", rating: 4.3, review_count: 58 },
  },
  {
    handle: "veda-band-ring", title: "Classic Band Ring", price: 1299, size: "", sizes: ["6", "7", "8"], inventory: 100,
    body: `<p><strong>Waterproof</strong> and <strong>18K gold plated</strong> stainless steel. A 3mm everyday band that doesn't mind the pool, the kitchen or the gym. Sizes 6, 7 and 8.</p>`,
    m: { ...STEEL_PVD, category: "ring", subtype: "band", collection: "Rings", width_mm: 3, weight_g: 2.5, adjustable: false, ring_size: "6, 7, 8", closure: null, shape: "band", finish: "polished", tone: "yellow gold", style_tags: ["minimal", "layering"], occasions: ["everyday", "office"], margin_band: "medium", launch_date: "2025-08-20", rating: 4.5, review_count: 102 },
  },
  {
    handle: "veda-cz-solitaire-ring", title: "Solitaire Ring", price: 1999, size: "", sizes: ["6", "7", "8"], inventory: 100,
    body: `<p>A 6mm American diamond solitaire on a slim gold-toned band. Water friendly for handwashing. Sizes 6 to 8.</p>`,
    m: { base_metal: "brass", plating: null, plating_microns: null, lead_free: null, anti_tarnish_warranty_months: null, category: "ring", subtype: "band", collection: "Rings", width_mm: 2, weight_g: 2.2, adjustable: false, ring_size: "6, 7, 8", closure: null, stone_type: "CZ / American diamond", setting: "six-prong", stone_count: 1, shape: "solitaire", finish: "polished", tone: "yellow gold", style_tags: ["classic"], occasions: ["gifting", "festive"], margin_band: "medium", launch_date: "2025-11-01", rating: 4.2, review_count: 49 },
  },
  {
    handle: "veda-twist-ring", title: "Twist Ring", price: 1199, size: "Adjustable", inventory: 100,
    body: `<p><strong>Waterproof</strong> and <strong>18K gold plated</strong> stainless steel. A twisted open ring that adjusts to fit. Stack two, stack five.</p>`,
    m: { ...STEEL_PVD, category: "ring", subtype: "band", collection: "Rings", width_mm: 3, weight_g: 2, adjustable: true, closure: "adjustable", shape: "twist", finish: "textured", tone: "yellow gold", style_tags: ["minimal", "layering"], occasions: ["everyday"], margin_band: "medium", launch_date: "2026-01-05", rating: 4.4, review_count: 70 },
  },
  {
    handle: "veda-signet-ring", title: "Signet Ring", price: 1699, size: "Adjustable", inventory: 100,
    body: `<p><strong>Waterproof</strong> and <strong>18K gold plated</strong> stainless steel. An oval signet with a brushed top, adjustable. Main-character energy.</p>`,
    m: { ...STEEL_PVD, category: "ring", subtype: "band", collection: "Rings", width_mm: 10, weight_g: 5, adjustable: true, closure: "adjustable", shape: "oval signet", finish: "textured", tone: "yellow gold", style_tags: ["statement"], occasions: ["everyday"], margin_band: "low", launch_date: "2025-07-15", rating: 4.1, review_count: 33 },
  },

  /* ═════════════ BRACELETS (4) ═════════════ */
  {
    handle: "kaya-cuff", title: "Open Cuff Bracelet", price: 2699, size: "Free size", inventory: 100,
    body: `<p><strong>Waterproof</strong> and <strong>18K gold plated</strong> stainless steel. A clean 6mm open cuff with a little give, so it fits most wrists.</p>`,
    m: { ...STEEL_PVD, category: "bracelet", subtype: "cuff", collection: "Bracelets", width_mm: 6, weight_g: 12, adjustable: true, closure: "slip-on", shape: "cuff", finish: "polished", tone: "yellow gold", style_tags: ["minimal", "statement"], occasions: ["everyday", "office"], margin_band: "high", launch_date: "2025-12-15", rating: 4.5, review_count: 64 },
  },
  {
    handle: "kaya-chain-bracelet", title: "Chain Bracelet", price: 1599, size: "16cm + 3cm", inventory: 100,
    body: `<p><strong>Waterproof</strong> and <strong>18K gold plated</strong> stainless steel. A fine chain bracelet, 16cm with a 3cm extender. Never take it off.</p>`,
    m: { ...STEEL_PVD, category: "bracelet", subtype: "bracelet", collection: "Bracelets", chain_length_cm: 16, extender_cm: 3, weight_g: 3, closure: "lobster clasp", shape: "cable", finish: "polished", tone: "yellow gold", style_tags: ["minimal", "layering"], occasions: ["everyday", "gifting"], margin_band: "medium", launch_date: "2025-04-10", rating: 4.4, review_count: 150 },
  },
  {
    handle: "kaya-tennis-bracelet", title: "Tennis Bracelet", price: 4499, compare: 5999, size: "17cm", inventory: 18, tags: ["clearance"],
    body: `<p>Clearance ⚡ <strong>18K gold plated</strong> brass with a row of 2.5mm American diamonds, 17cm long. Last few pieces. Keep away from water.</p>`,
    m: { ...BRASS_GOLD, category: "bracelet", subtype: "bracelet", collection: "Bracelets", chain_length_cm: 17, weight_g: 10, water_resistant: false, closure: "lobster clasp", stone_type: "CZ / American diamond", setting: "prong", stone_count: 52, shape: "tennis", finish: "polished", tone: "yellow gold", style_tags: ["statement", "classic"], occasions: ["festive", "wedding guest", "gifting"], margin_band: "low", excluded: true, launch_date: "2024-11-01", rating: 4.2, review_count: 81 },
  },
  {
    handle: "kaya-hammered-cuff", title: "Hammered Cuff Bracelet", price: 3199, compare: 3699, size: "Free size", inventory: 100,
    body: `<p><strong>Waterproof</strong> and <strong>18K gold plated</strong> stainless steel. A hand-hammered 12mm cuff that catches the light.</p>`,
    m: { ...STEEL_PVD, category: "bracelet", subtype: "cuff", collection: "Bracelets", width_mm: 12, weight_g: 18, adjustable: true, closure: "slip-on", shape: "cuff", finish: "hammered", tone: "yellow gold", style_tags: ["statement"], occasions: ["everyday", "festive", "gifting"], margin_band: "high", launch_date: "2026-06-01", rating: 4.6, review_count: 29 },
  },
];

/* ───────────── builder ───────────── */

const SNIPPET_POOL: Record<string, string[]> = {
  earrings: ["Lightweight, I forget I'm wearing them.", "Colour hasn't changed in 3 months.", "Looks way more expensive than it is.", "Bought as a gift, she loved it.", "Packaging was so cute, perfect for gifting."],
  necklace: ["Sits perfectly at the collarbone.", "Clasp is sturdy, chain feels premium.", "Layers really well with my other chains.", "Wore it daily for weeks, still shiny."],
  ring: ["Fits true to size.", "Doesn't turn my finger green at all.", "Comfortable for typing all day.", "Stacks nicely."],
  bracelet: ["Light on the wrist, looks rich.", "Clasp is easy to do one-handed.", "Matches my watch perfectly.", "Got compliments the first day."],
};
const AUTHORS = ["Sneha R.", "Aditi V.", "Riya M.", "Tanvi G.", "Simran K.", "Nidhi B.", "Mansi J.", "Ishita P.", "Payal C.", "Zoya H.", "Kritika L.", "Fatima S."];

function band(p: number): Jewellery["price_band"] {
  return p < 1500 ? "under_1500" : p < 3000 ? "1500_3000" : "3000_5000";
}
function care(base: Jewellery["base_metal"]): string {
  if (base === "316L stainless steel") return "Rinse and pat dry. Safe with water, sweat and perfume. Store in the pouch to avoid scratches.";
  if (base === "925 silver") return "Wipe with the polishing cloth. Keep away from water and perfume. Store in the zip pouch.";
  return "Keep dry and away from perfume. Wipe after wear and store in the pouch.";
}

export function buildProducts(): Product[] {
  return DEFS.map((d, i) => {
    const m = d.m;
    const j: Jewellery = {
      category: m.category, subtype: m.subtype, collection: m.collection, price_band: band(d.price),
      outer_diameter_mm: m.outer_diameter_mm ?? null, inner_diameter_mm: m.inner_diameter_mm ?? null, drop_length_mm: m.drop_length_mm ?? null,
      width_mm: m.width_mm ?? null, thickness_mm: m.thickness_mm ?? null, chain_length_cm: m.chain_length_cm ?? null, extender_cm: m.extender_cm ?? null,
      ring_size: m.ring_size ?? null, adjustable: m.adjustable ?? null, weight_g: m.weight_g ?? null,
      base_metal: m.base_metal, plating: m.plating ?? null, plating_microns: m.plating_microns ?? null,
      post_material: m.post_material ?? null, nickel_free: m.nickel_free ?? null, lead_free: m.lead_free ?? null,
      water_resistant: m.water_resistant ?? null, sweat_resistant: m.sweat_resistant ?? null, perfume_safe: m.perfume_safe ?? null,
      anti_tarnish_warranty_months: m.anti_tarnish_warranty_months ?? null,
      closure: m.closure ?? null, stone_type: m.stone_type ?? "none", setting: m.setting ?? null, stone_count: m.stone_count ?? 0,
      shape: m.shape ?? null, finish: m.finish ?? "polished", tone: m.tone ?? "yellow gold", style_tags: m.style_tags, occasions: m.occasions,
      care: care(m.base_metal), dispatch_days: m.dispatch_days ?? 0, made_to_order: m.made_to_order ?? false,
      margin_band: m.margin_band ?? "medium", pinned: m.pinned ?? false, excluded: m.excluded ?? false, launch_date: m.launch_date ?? "2025-06-01",
      rating: m.rating ?? 4.4, review_count: m.review_count ?? 50,
      review_snippets: d.snippets
        ? d.snippets.map(([author, rating, text]) => ({ author, rating, text }))
        : [0, 1, 2].map((k) => {
            const pool = SNIPPET_POOL[m.category];
            return { author: AUTHORS[(i * 3 + k) % AUTHORS.length], rating: k === 2 ? 4 : 5, text: pool[(i + k) % pool.length] };
          }),
    };
    const sizes = d.sizes ?? [d.size];
    const skuBase = "CSM-" + d.handle.toUpperCase();
    const variants = sizes.map((s, v) => ({
      id: 44100000000 + i * 10 + v,
      sku: d.sizes ? `${skuBase}-${s}` : skuBase,
      title: d.sizes ? `Size ${s} / Yellow gold` : `${s} / Yellow gold`,
      price: d.price.toFixed(2),
      compare_at_price: d.compare ? d.compare.toFixed(2) : null,
      option1: d.sizes ? s : d.size,
      option2: "Yellow gold",
      inventory_quantity: d.inventory, // stock per variant (per ring size)
      grams: Math.round(j.weight_g ?? 5),
    }));
    const img = (role: "front" | "on_model") => ({ src: `/images/products/${d.handle}/${role}.jpg`, alt: `${d.title}, ${role.replace("_", " ")}`, role });
    return {
      id: 8100000000 + i,
      handle: d.handle,
      title: d.title,
      body_html: d.body,
      vendor: "Cosmos",
      product_type: { earrings: "Earrings", necklace: "Necklaces", ring: "Rings", bracelet: "Bracelets" }[m.category],
      tags: [m.category, m.collection.toLowerCase(), m.subtype, ...m.style_tags, ...(d.tags ?? [])],
      created_at: `${j.launch_date}T10:00:00+05:30`,
      variants,
      images: [img("front"), img("on_model")],
      metafields: { jewellery: j },
    };
  });
}

export const PLANTED = {
  waterproof_prose_only: [
    "kira-mini-huggies", "kira-twist-huggies", "mira-teardrop-drops", "sana-chain-threaders",
    "sol-paperclip-chain", "sol-snake-chain", "sol-rope-chain", "sol-layered-chain-set", "luna-coin-pendant", "luna-evil-eye-pendant", "luna-heart-pendant",
    "veda-dome-ring", "veda-band-ring", "veda-twist-ring", "veda-signet-ring",
    "kaya-cuff", "kaya-chain-bracelet", "kaya-hammered-cuff",
  ],
  hypoallergenic_posts_prose_only: ["tara-solitaire-studs", "tara-pearl-studs", "tara-heart-studs", "elle-bezel-studs", "kira-mini-huggies", "kira-twist-huggies"],
  vague_wording: [
    { sku: "lia-flower-studs", phrase: "gold-toned" },
    { sku: "mira-pearl-drops", phrase: "water friendly" },
    { sku: "maya-pearl-choker", phrase: "skin-safe for most" },
    { sku: "veda-cz-solitaire-ring", phrase: "gold-toned" },
  ],
};

/** Regexes the validator uses to confirm prose actually carries the planted claim. */
export const WATERPROOF_PROSE = /(shower-?proof|pool|waterproof|swim)/i;
export const HYPO_POST_PROSE = /(titanium posts?|surgical-grade|surgical-steel posts?)/i;
