/**
 * `npm run pipelines`: the offline AI decisions → data/generated/*.json (never hand-edited).
 *  1. Catalogue understanding  → enriched_catalogue.json, attributes_to_confirm.json
 *  2. Reading return reasons   → returns_classified.json
 *  3. Turning chats into themes→ intent_clusters.json
 *  4. Rail curation per context→ rails.json, openers.json
 *  5. Proposals                → proposals.json  (numbers computed in code from 1–4 + orders)
 * Pipelines never read evals/planted_facts.json.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ROOT, loadDb, readJson } from "../../src/lib/data/disk";
import * as S from "../../src/lib/schemas";
import type { Product } from "../../src/lib/schemas";
import { slice, byAdGroup } from "../../src/lib/metrics";
import { llmObject, producer, useLlm } from "./llm";

const db = loadDb();
const P = (h: string) => db.products.find((p) => p.handle === h)!;
const out = (name: string, data: unknown) => {
  mkdirSync(join(ROOT, "data/generated"), { recursive: true });
  writeFileSync(join(ROOT, "data/generated", name), JSON.stringify(data, null, 2) + "\n");
  console.log("  wrote data/generated/" + name);
};
const stripHtml = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const VERIFIED_NULLABLE = ["water_resistant", "sweat_resistant", "perfume_safe", "post_material", "nickel_free", "lead_free", "plating", "plating_microns"] as const;

/* ═════════ 1. catalogue understanding ═════════ */

type Attr = z.infer<typeof S.ExtractedAttribute>;
const EXTRACT_RULES: { re: RegExp; attribute: string; value: string | boolean; confidence: number; vague?: boolean }[] = [
  { re: /shower-?proof|waterproof|pool[- ]?(safe|proof)?|goes in the pool|swim(-safe)?/i, attribute: "water_resistant", value: true, confidence: 0.8 },
  { re: /sweat(-proof)?|gym/i, attribute: "sweat_resistant", value: true, confidence: 0.6 },
  { re: /titanium posts?/i, attribute: "post_material", value: "titanium", confidence: 0.85 },
  { re: /surgical-grade titanium/i, attribute: "post_material", value: "surgical-grade titanium", confidence: 0.9 },
  { re: /surgical-steel posts?/i, attribute: "post_material", value: "surgical steel", confidence: 0.85 },
  { re: /sensitive (lobes|ears)/i, attribute: "nickel_free", value: true, confidence: 0.45 },
  { re: /water friendly/i, attribute: "water_resistant", value: "partial (vague wording)", confidence: 0.3, vague: true },
  { re: /gold-toned/i, attribute: "plating", value: "unspecified gold tone (vague wording)", confidence: 0.3, vague: true },
  { re: /skin-safe for most/i, attribute: "nickel_free", value: "unclear (vague wording)", confidence: 0.25, vague: true },
];

async function enrich() {
  console.log("1. catalogue understanding");
  const skus: Record<string, { attributes: Attr[] }> = {};
  if (useLlm) {
    const Schema = z.object({ items: z.array(z.object({ sku: z.string(), attributes: z.array(z.object({ attribute: z.enum(VERIFIED_NULLABLE), value: z.union([z.string(), z.boolean(), z.number()]), phrase: z.string(), confidence: z.number(), vague: z.boolean() })) })) });
    const items = db.products.map((p) => ({ sku: p.handle, unknown_fields: VERIFIED_NULLABLE.filter((f) => p.metafields.jewellery[f] === null), text: stripHtml(p.body_html) }));
    const res = await llmObject(
      Schema,
      "You extract jewellery attributes from messy Indian D2C brand copy. Only fill fields listed in unknown_fields. For each, quote the exact phrase from the text that supports it. Lower confidence for inferred values (e.g. nickel_free from 'sensitive ears'). Mark vague=true for hedged wording like 'gold-toned', 'water friendly', 'skin-safe for most'. If the text says nothing, omit the field. Never invent.",
      JSON.stringify(items),
    );
    for (const it of res.items) skus[it.sku] = { attributes: it.attributes.filter((a) => a.phrase && stripHtml(P(it.sku)?.body_html ?? "").toLowerCase().includes(a.phrase.toLowerCase().slice(0, 12))).map((a) => ({ attribute: a.attribute, value: a.value, source: { type: "text" as const, phrase: a.phrase }, confidence: Math.max(0, Math.min(1, a.confidence)), verified: false as const, vague: a.vague })) };
  } else {
    for (const p of db.products) {
      const text = stripHtml(p.body_html);
      const attrs: Attr[] = [];
      for (const r of EXTRACT_RULES) {
        const m = text.match(r.re);
        if (!m) continue;
        if (p.metafields.jewellery[r.attribute as keyof Product["metafields"]["jewellery"]] !== null) continue; // verified already
        if (attrs.some((a) => a.attribute === r.attribute)) continue;
        // quote the whole sentence that carries the claim (the source phrase the brand will confirm)
        const i = m.index ?? 0;
        const start = Math.max(text.lastIndexOf(". ", i), text.lastIndexOf("! ", i), text.lastIndexOf(": ", i)) + 2;
        const ends = [". ", "! ", "? "].map((e) => text.indexOf(e, i + m[0].length)).filter((x) => x >= 0);
        const end = ends.length ? Math.min(...ends) + 1 : text.length;
        const phrase = text.slice(Math.max(0, start === 1 ? 0 : start), end).trim();
        attrs.push({ attribute: r.attribute, value: r.value, source: { type: "text", phrase }, confidence: r.confidence, verified: false, vague: !!r.vague });
      }
      skus[p.handle] = { attributes: attrs };
    }
  }
  for (const p of db.products) skus[p.handle] ??= { attributes: [] };
  const enriched = { producer: { ...producer("enrichment", "enrich-v1"), note: producer("enrichment", "enrich-v1").note + " Image enrichment pending: product photos not yet sourced." }, skus };
  out("enriched_catalogue.json", S.EnrichedSchema.parse(enriched));

  const items = Object.entries(skus).flatMap(([sku, v]) =>
    v.attributes.filter((a) => !a.vague && a.confidence >= 0.5).map((a) => ({
      id: `atc-${sku}-${a.attribute}`, sku, title: P(sku).title, attribute: a.attribute, proposed_value: a.value, source_phrase: a.source.phrase, confidence: a.confidence,
      unlocks: a.attribute === "post_material" ? ["prop-new-ad-group-hypoallergenic"] : a.attribute === "water_resistant" ? ["prop-feed-waterproof"] : [],
    })),
  );
  out("attributes_to_confirm.json", S.AttributesToConfirmSchema.parse({ producer: producer("enrichment", "enrich-v1"), items }));
  return enriched;
}

/* ═════════ 2. reading return reasons ═════════ */

const RETURN_THEMES: [string, string, RegExp][] = [
  ["size_smaller", "Wanted bigger", /wanted something bigger|smaller than|looked smaller|chhota|too small/i],
  ["size_bigger", "Looked bigger than expected", /bigger|huge|too big|large|bada|bade|statement earrings/i],
  ["too_long", "Too long", /too long|lamba|longest|hangs weird|too much for work/i],
  ["tangles", "Tangles", /tangl/i],
  ["gift_not_liked", "Gift not liked", /gift|pasand/i],
  ["late_delivery", "Arrived too late", /late|longer to arrive/i],
  ["colour", "Colour different from photo", /colou?r|yellow/i],
  ["fit", "Didn't fit", /fit|tight|loose|size chart/i],
  ["quality", "Clasp / build issue", /clasp|latch|back kept|stiff|heavy|broke|patla/i],
  ["changed_mind", "Changed mind", /changed|mistake|didn't suit|single chain|ordered two/i],
];

async function classifyReturns() {
  console.log("2. reading return reasons");
  const all = db.returns.flatMap((r) => r.reasons_raw.map((x) => ({ sku: r.sku, ...x })));
  let labelOf: Record<string, string> = {};
  if (useLlm) {
    const themes = RETURN_THEMES.map(([k, l]) => `${k}: ${l}`).join("\n");
    const res = await llmObject(
      z.object({ labels: z.array(z.object({ id: z.string(), theme: z.string() })) }),
      `Classify each free-text jewellery return reason (English/Hinglish) into one theme key:\n${themes}\nother: anything else`,
      JSON.stringify(all.map((a) => ({ id: a.id, text: a.text }))),
    );
    labelOf = Object.fromEntries(res.labels.map((l) => [l.id, l.theme]));
  } else {
    for (const a of all) labelOf[a.id] = RETURN_THEMES.find(([, , re]) => re.test(a.text))?.[0] ?? "other";
  }
  const labelName = (k: string) => RETURN_THEMES.find(([t]) => t === k)?.[1] ?? "Other";

  const betterFit = (sku: string, theme: string, ctx: string): [string | null, string | null] => {
    const p = P(sku), j = p.metafields.jewellery;
    const rate = (h: string) => {
      const e = db.returns.find((r) => r.sku === h)!;
      const u = e.by_use_context[ctx as "office"];
      return u ? u.returns / Math.max(1, u.units) : e.return_rate;
    };
    if (theme === "size_bigger" && j.outer_diameter_mm) {
      const fam = db.products.filter((x) => x.handle !== sku && x.metafields.jewellery.collection === j.collection && x.metafields.jewellery.subtype === j.subtype && (x.metafields.jewellery.outer_diameter_mm ?? 99) < j.outer_diameter_mm!);
      const best = fam.sort((a, b) => rate(a.handle) - rate(b.handle))[0];
      if (best) return [best.handle, `Same hoop style, ${best.metafields.jewellery.outer_diameter_mm}mm instead of ${j.outer_diameter_mm}mm; lower returns in this context`];
    }
    if (theme === "too_long" && j.chain_length_cm) {
      const fam = db.products.filter((x) => x.handle !== sku && x.metafields.jewellery.category === j.category && (x.metafields.jewellery.chain_length_cm ?? 99) < j.chain_length_cm! && !x.metafields.jewellery.excluded);
      const best = fam.sort((a, b) => rate(a.handle) - rate(b.handle))[0];
      if (best) return [best.handle, `Single ${best.metafields.jewellery.chain_length_cm}cm chain sits higher than the ${j.chain_length_cm}cm layer`];
    }
    return [null, null];
  };

  const skus: Record<string, { contexts: Record<string, unknown> }> = {};
  for (const r of db.returns) {
    const groups: Record<string, typeof r.reasons_raw> = { all: r.reasons_raw };
    for (const x of r.reasons_raw) if (x.use_context) (groups[x.use_context] ??= []).push(x);
    const contexts: Record<string, unknown> = {};
    for (const [ctx, rs] of Object.entries(groups)) {
      const counts: Record<string, number> = {};
      rs.forEach((x) => (counts[labelOf[x.id] ?? "other"] = (counts[labelOf[x.id] ?? "other"] ?? 0) + 1));
      const themes = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([theme, count]) => ({ theme, label: labelName(theme), count, share: Math.round((count / rs.length) * 100) / 100 }));
      const top = themes[0].theme;
      const quote = rs.filter((x) => labelOf[x.id] === top).sort((a, b) => a.text.length - b.text.length)[Math.floor(rs.filter((x) => labelOf[x.id] === top).length / 2)]?.text ?? rs[0].text;
      const [bf, why] = betterFit(r.sku, top, ctx);
      contexts[ctx] = { n_reasons: rs.length, themes, top_theme: top, typical_quote: quote, better_fit_sku: bf, better_fit_reason: why };
    }
    skus[r.sku] = { contexts };
  }
  const data = { producer: producer("return-reasons", "returns-v1"), skus };
  out("returns_classified.json", data);
  return data;
}

/* ═════════ 3. chats → intent clusters ═════════ */

const INTENT_RULES: [string, string, RegExp, boolean][] = [
  ["hypoallergenic", "Sensitive ears / hypoallergenic", /allerg|sensitive|nickel|itch|titanium|surgical|irritat|piercing|swell|red with|skin safe|post material|posts made|316l steel ok/i, true],
  ["waterproof", "Waterproof / shower / sweat", /shower|pool|swim|waterproof|water resistant|sweat|bath|sea water|chlorine|yoga|rain|tarnish if|turn green|faded|gold come off|gold last|pvd|perfume|hands|24\/7|steam|dishwash|sunscreen|tarnish warranty/i, false],
  ["delivery", "Delivery by a date", /deliver|reach|ship|by friday|by saturday|by thursday|by 1\dth|kab|aayega|milega|mil jayega|express|same day|track|cod|2 days|before|weekend|charges|how long for|how many days|karva|sangeet/i, false],
  ["size_fit", "Size and fit", /big|size|heavy|hang|diameter|inner|small|length|long|fit|weight|thickness|petite|bade|lamba|wrist/i, false],
  ["gifting", "Gifting", /gift|note|wrap|anniversary|bhabhi|bridesmaid|shaadi|invoice|different address|matching|she doesn't like/i, false],
  ["returns_trust", "Returns and trust", /return|refund|warranty|breaks|real gold|genuine|exchange|secure/i, false],
];

async function clusterIntents() {
  console.log("3. chats → intent clusters");
  const msgs = S.ChatLogsSchema.parse(readJson("data/chat_logs_seed.json")).messages;
  let themeOf: Record<string, string> = {};
  if (useLlm) {
    const res = await llmObject(
      z.object({ themes: z.array(z.object({ key: z.string(), label: z.string(), catalogue_gap: z.boolean() })), assignments: z.array(z.object({ id: z.string(), theme: z.string() })) }),
      "Cluster shopper questions from a jewellery store's chat (English + Hinglish) into 5–8 themes. Merge synonyms (e.g. 'sensitive ears', 'nickel-free', 'kaan mein allergy' are one theme). Use short snake_case keys; include an 'other' theme. catalogue_gap=true when the store's verified catalogue likely can't answer the theme.",
      JSON.stringify(msgs.map((m) => ({ id: m.id, text: m.message }))),
    );
    themeOf = Object.fromEntries(res.assignments.map((a) => [a.id, a.theme]));
    INTENT_RULES.splice(0, INTENT_RULES.length, ...res.themes.map((t) => [t.key, t.label, /$^/, t.catalogue_gap] as [string, string, RegExp, boolean]));
  } else {
    for (const m of msgs) themeOf[m.id] = INTENT_RULES.find(([, , re]) => re.test(m.message))?.[0] ?? "other";
  }
  const keys = [...new Set(Object.values(themeOf))];
  const clusters = keys.map((k) => {
    const ms = msgs.filter((m) => themeOf[m.id] === k);
    const rule = INTENT_RULES.find(([key]) => key === k);
    const sessions = new Set(ms.map((m) => m.session_id));
    return {
      id: k,
      label: rule?.[1] ?? "Other / off-topic",
      count: ms.length,
      sessions: sessions.size,
      sample_wordings: ms.slice(0, 6).map((m) => m.message),
      conversion_rate: Math.round((ms.filter((m) => m.converted).length / ms.length) * 100) / 100,
      unmet_rate: Math.round((ms.filter((m) => m.unmet).length / ms.length) * 100) / 100,
      hinglish_count: ms.filter((m) => m.language === "hi-Latn").length,
      message_ids: ms.map((m) => m.id),
      catalogue_gap: rule?.[3] ?? false,
    };
  }).sort((a, b) => b.count - a.count);
  const data = { producer: producer("intent-clusters", "intents-v1"), total_messages: msgs.length, clusters };
  out("intent_clusters.json", S.IntentClustersSchema.parse(data));
  return data;
}

/* ═════════ 4. rails + openers ═════════ */

function verifiedReason(p: Product, hints: string, enriched: S.Enriched): string {
  const j = p.metafields.jewellery;
  const bits: string[] = [];
  const h = hints.toLowerCase();
  if (/waterproof|shower/.test(h) && j.water_resistant === true) bits.push("verified water-resistant");
  if (/sensitive|titanium|nickel/.test(h)) {
    const post = enriched.skus[p.handle]?.attributes.find((a) => a.attribute === "post_material");
    if (post) bits.push(`${post.value} posts (from product description, brand confirming)`);
  }
  if (j.outer_diameter_mm && j.category === "earrings") bits.push(`${j.outer_diameter_mm}mm${j.drop_length_mm && j.drop_length_mm !== j.outer_diameter_mm ? `, ~${j.drop_length_mm}mm on the ear` : ""}`);
  else if (j.drop_length_mm && j.category === "earrings") bits.push(`${j.drop_length_mm}mm drop`);
  if (j.chain_length_cm) bits.push(`${j.chain_length_cm}cm${j.extender_cm ? ` + ${j.extender_cm}cm` : ""}`);
  if (/office|light/.test(h) && j.category === "earrings" && j.weight_g && j.weight_g <= 5) bits.push(`${j.weight_g}g the pair`);
  if (/wedding|festive|statement/.test(h) && j.stone_type !== "none") bits.push(j.stone_type === "kundan" ? "handset kundan" : j.stone_type === "pearl" ? "pearl" : "CZ sparkle");
  if (/gift/.test(h) && j.occasions.includes("gifting")) bits.push("gift-ready");
  if (j.made_to_order) bits.push(`made to order (${j.dispatch_days}-day dispatch)`);
  if (bits.length < 2) bits.push(`${j.base_metal}${j.plating ? `, ${j.plating}` : ""}`);
  const s = bits.slice(0, 3).join(" · ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function railsAndOpeners(enriched: S.Enriched) {
  console.log("4. rail curation + openers");
  const rules = db.rules;
  const marginRank = { low: 0, medium: 1, high: 2 } as const;
  const excluded = new Map(rules.excluded_skus.map((e) => [e.sku, e.reason]));
  const rails: Record<string, { items: { rank: number; sku: string; reason: string; pinned: boolean }[]; rules_applied: { sku: string; action: "pinned" | "removed"; why: string }[] }> = {};
  const openers: Record<string, { chip: string; opener: string; suggested_chips: string[] }> = {};

  for (const g of db.adGroups) {
    const hints = g.context_hints.join("; ");
    const rulesApplied: { sku: string; action: "pinned" | "removed"; why: string }[] = [];
    const pool = g.candidate_skus.filter((h) => h !== g.hero_sku).filter((h) => {
      const j = P(h).metafields.jewellery;
      if (excluded.has(h)) return rulesApplied.push({ sku: h, action: "removed", why: excluded.get(h)! }), false;
      if (marginRank[j.margin_band] < marginRank[rules.margin_floor_band]) return rulesApplied.push({ sku: h, action: "removed", why: `Margin band "${j.margin_band}" below floor "${rules.margin_floor_band}"` }), false;
      return true;
    });
    const pins = rules.pinned[g.id] ?? [];
    pins.forEach((p) => rulesApplied.push({ sku: p.sku, action: "pinned", why: `Pinned to slot ${p.slot} by the brand` }));
    const unpinned = pool.filter((h) => !pins.some((p) => p.sku === h));

    let ranked: { sku: string; reason: string }[];
    if (useLlm) {
      const res = await llmObject(
        z.object({ items: z.array(z.object({ sku: z.string(), reason: z.string() })) }),
        "You curate a 'picked for you' rail for a jewellery product page, given the ad's context hints. Rank the candidates and write one short reason each (max 12 words). Use ONLY the verified facts provided; describe 'unverified_materials' as materials (e.g. 'titanium posts per description'), never as benefits like 'hypoallergenic'. Never mention where the shopper came from by platform name. Include one complementary non-earring piece if the candidates allow.",
        JSON.stringify({ context_hints: g.context_hints, hero: g.hero_sku, candidates: unpinned.map((h) => ({ sku: h, verified: { ...P(h).metafields.jewellery, review_snippets: undefined, care: undefined }, price_inr: Number(P(h).variants[0].price), unverified_materials: enriched.skus[h]?.attributes ?? [] })) }),
      );
      ranked = res.items.filter((i) => unpinned.includes(i.sku));
    } else {
      const h = hints.toLowerCase();
      const score = (sku: string) => {
        const p = P(sku), j = p.metafields.jewellery;
        let s = j.rating * 0.5 + marginRank[j.margin_band] * 0.25;
        if (/waterproof|shower/.test(h)) s += j.water_resistant === true ? 3 : 0;
        if (/under ₹5,000/.test(h) && Number(p.variants[0].price) <= 5000) s += 0.5;
        if (/office/.test(h)) s += (j.occasions.includes("office") ? 2 : 0) + ((j.outer_diameter_mm ?? 0) <= 30 ? 0.5 : 0);
        if (/minimal/.test(h) && j.style_tags.includes("minimal")) s += 1;
        if (/lightweight/.test(h) && (j.weight_g ?? 99) <= 5) s += 0.5;
        if (/wedding|festive/.test(h)) s += (j.occasions.includes("wedding guest") ? 3 : 0) + (j.occasions.includes("festive") ? 1 : 0);
        if (/statement/.test(h) && j.style_tags.includes("statement")) s += 1;
        if (/gift/.test(h) && j.occasions.includes("gifting")) s += 0.5;
        if (/sensitive|titanium|nickel/.test(h) && enriched.skus[sku]?.attributes.some((a) => a.attribute === "post_material")) s += 3;
        // gross sales in this context (returns are handled by proposals, not here)
        s += Math.log10(1 + (db.returns.find((r) => r.sku === sku)?.by_ad_group[g.id]?.units ?? 0)) * 0.8;
        return s;
      };
      const sorted = [...unpinned].sort((a, b) => score(b) - score(a));
      // one complementary piece from another category, if any
      const heroCat = P(g.hero_sku).metafields.jewellery.category;
      const slots = rules.rail_size - pins.length;
      let pick = sorted.slice(0, slots);
      // complement: the other-category piece with the most gross revenue in this context
      const gross = (sku: string) => (db.returns.find((r) => r.sku === sku)?.by_ad_group[g.id]?.units ?? 0) * Number(P(sku).variants[0].price);
      const comp = sorted.filter((s) => P(s).metafields.jewellery.category !== heroCat).sort((a, b) => gross(b) - gross(a))[0];
      if (comp && !pick.includes(comp)) pick = [...pick.slice(0, slots - 1), comp];
      ranked = pick.map((sku) => ({ sku, reason: verifiedReason(P(sku), hints, enriched) }));
    }
    const items: { rank: number; sku: string; reason: string; pinned: boolean }[] = [];
    const queue = [...ranked];
    for (let slot = 1; slot <= rules.rail_size; slot++) {
      const pin = pins.find((p) => p.slot === slot);
      if (pin) items.push({ rank: slot, sku: pin.sku, reason: verifiedReason(P(pin.sku), hints, enriched), pinned: true });
      else if (queue.length) items.push({ rank: slot, ...queue.shift()!, pinned: false });
    }
    rails[g.id] = { items, rules_applied: rulesApplied };

    // openers
    const hero = P(g.hero_sku), hj = hero.metafields.jewellery;
    const CHIP: Record<string, string> = {
      "waterproof-everyday-under-5k": "Waterproof everyday · under ₹5k",
      "wedding-guest-gift": "Wedding guest · gift-ready",
      "office-minimal": "Office · minimal & light",
      "hypoallergenic-studs": "Sensitive ears · titanium posts",
    };
    if (useLlm) {
      const o = await llmObject(
        z.object({ chip: z.string(), opener: z.string(), suggested_chips: z.array(z.string()).min(2).max(3) }),
        "Write landing-page copy for a jewellery product page reached from an ad. chip: ≤5 words echoing the ad context with ' · ' separators. opener: one or two warm, concise sentences (≤35 words) using only the verified facts given; no hype, no platform names. suggested_chips: 2–3 short questions a shopper in this context would tap.",
        JSON.stringify({ context_hints: g.context_hints, hero: { title: hero.title, verified: { outer_diameter_mm: hj.outer_diameter_mm, drop_length_mm: hj.drop_length_mm, water_resistant: hj.water_resistant, base_metal: hj.base_metal, plating: hj.plating, price_inr: Number(hero.variants[0].price) } } }),
      );
      openers[g.id] = { ...o, chip: o.chip.replace(/chatgpt/gi, "") };
    } else {
      const facts = [hj.water_resistant ? "verified water-resistant" : null, `${hj.base_metal}${hj.plating ? ` with ${hj.plating}` : ""}`].filter(Boolean).join(", ");
      const OPEN: Record<string, string> = {
        "waterproof-everyday-under-5k": `Looking for gold you can shower and gym in? ${hero.title} are ${facts}, at ₹${Number(hero.variants[0].price).toLocaleString("en-IN")}. Want help picking the right size?`,
        "wedding-guest-gift": `Shopping for a wedding? ${hero.title} photograph beautifully, and we've picked festive pieces below. Gift wrap and a handwritten note are available.`,
        "office-minimal": `Something light for long workdays? ${hero.title} sit close to the lobe at ${hj.outer_diameter_mm}mm and are ${facts}.`,
        "hypoallergenic-studs": `Everyday studs on titanium and surgical-steel posts, as described by the brand. Ask me what each post is made of.`,
      };
      const CHIPS: Record<string, string[]> = {
        "waterproof-everyday-under-5k": ["Will these work for office?", "Can I shower with these?", "When will it be delivered?"],
        "wedding-guest-gift": ["Is gift wrap available?", "Need it before the wedding", "Show me jhumkas"],
        "office-minimal": ["How big do they look?", "Can I sleep in them?", "When will it be delivered?"],
        "hypoallergenic-studs": ["What are the posts made of?", "Which is best for a gift?", "When will it be delivered?"],
      };
      openers[g.id] = { chip: CHIP[g.id] ?? g.context_hints.slice(0, 2).join(" · "), opener: OPEN[g.id] ?? `Here's ${hero.title}.`, suggested_chips: CHIPS[g.id] ?? ["When will it be delivered?", "Is gift wrap available?"] };
    }
  }
  out("rails.json", S.RailsSchema.parse({ producer: producer("rail-ranking", "rails-v1"), rails }));
  out("openers.json", S.OpenersSchema.parse({ producer: producer("copy", "openers-v1"), openers }));
  return rails;
}

/* ═════════ 5. proposals (assembled in code from the AI outputs above) ═════════ */

function proposals(enriched: S.Enriched, clusters: S.IntentClusters, returnsCls: Awaited<ReturnType<typeof classifyReturns>>, rails: Record<string, { items: { sku: string }[] }>) {
  console.log("5. proposals");
  const os = S.OrdersSessionsSchema.parse(readJson("data/orders_sessions.json"));
  const list: S.Proposal[] = [];
  const hypoCluster = clusters.clusters.find((c) => /allerg|sensitive|nickel|hypo/i.test(c.id + c.label));
  const titaniumSkus = Object.entries(enriched.skus).filter(([, v]) => v.attributes.some((a) => a.attribute === "post_material" && /titanium|surgical/i.test(String(a.value)))).map(([k]) => k);
  if (hypoCluster && titaniumSkus.length) {
    const g = db.adGroups.find((x) => x.id === "hypoallergenic-studs")!;
    list.push({
      id: "prop-new-ad-group-hypoallergenic",
      type: "new_ad_group",
      title: `${hypoCluster.sessions} shoppers asked for hypoallergenic studs`,
      summary: `Shoppers keep asking about sensitive ears and nickel, and ${titaniumSkus.length} studs/huggies already mention titanium or surgical-steel posts in their descriptions, but none are tagged. Confirm the post material and launch a "Studs for sensitive ears" ad group.`,
      evidence: [
        { label: "Shoppers who asked", value: `${hypoCluster.sessions} (${hypoCluster.count} messages, ${hypoCluster.hinglish_count} in Hinglish)` },
        { label: "Unmet by the catalogue", value: `${Math.round(hypoCluster.unmet_rate * 100)}%` },
        { label: "Conversion when asked", value: `${Math.round(hypoCluster.conversion_rate * 100)}%` },
        { label: "Matching SKUs (unverified)", value: titaniumSkus.map((s) => P(s).title).join(", ") },
      ],
      examples: hypoCluster.sample_wordings.slice(0, 4),
      confidence: 0.82,
      impact: "New ad group; rail built from the newly tagged studs",
      apply: { action: "activate_ad_group", ad_group_id: g.id, confirm_attributes: titaniumSkus.map((s) => ({ sku: s, attribute: "post_material" })), daily_budget_inr: g.daily_budget_inr, send_to: "engage_campaign_agent" },
    });
  }
  const wpSkus = Object.entries(enriched.skus).filter(([, v]) => v.attributes.some((a) => a.attribute === "water_resistant" && a.value === true && !a.vague)).map(([k]) => k);
  const wpCluster = clusters.clusters.find((c) => /water|shower/i.test(c.id + c.label));
  if (wpSkus.length) {
    list.push({
      id: "prop-feed-waterproof",
      type: "feed_attribute",
      title: `Add "waterproof" to ${wpSkus.length} SKUs`,
      summary: `${wpSkus.length} steel + PVD SKUs say "shower-proof" or "pool-safe" in their copy, but the water_resistant attribute is empty, so the agent can't claim it and the ad feed can't match waterproof queries.`,
      evidence: [
        { label: "SKUs with the claim only in prose", value: String(wpSkus.length) },
        { label: "Shopper questions about water", value: wpCluster ? `${wpCluster.count}` : "n/a" },
        { label: "Example phrases", value: wpSkus.slice(0, 3).map((s) => `"${enriched.skus[s].attributes.find((a) => a.attribute === "water_resistant")!.source.phrase}"`).join(" · ") },
      ],
      examples: wpCluster?.sample_wordings.slice(0, 3) ?? [],
      confidence: 0.74,
      impact: "Waterproof rail and agent answers can include these SKUs once confirmed",
      apply: { action: "set_feed_attribute", attribute: "water_resistant", value: true, skus: wpSkus, requires_brand_confirmation: true },
    });
  }
  // remove from rail: high context return rate on a SKU currently on a rail
  for (const [agId, rail] of Object.entries(rails)) {
    for (const it of rail.items) {
      const e = db.returns.find((r) => r.sku === it.sku)!;
      const ctx = e.by_ad_group[agId];
      if (!ctx || ctx.return_rate < Math.max(0.15, e.return_rate * 2)) continue;
      const cls = returnsCls.skus[it.sku].contexts["office"] ?? returnsCls.skus[it.sku].contexts["all"];
      const t = (cls as { themes: { label: string; share: number }[]; better_fit_sku: string | null; typical_quote: string }).themes;
      const bf = (cls as { better_fit_sku: string | null }).better_fit_sku;
      list.push({
        id: `prop-remove-${it.sku}-${agId}`,
        type: "remove_from_rail",
        title: `Remove ${P(it.sku).title} from the "${db.adGroups.find((g) => g.id === agId)!.name}" rail`,
        summary: `Returns are ${Math.round(ctx.return_rate * 100)}% from this context vs ${Math.round(e.return_rate * 100)}% overall. Top reason: "${t[0].label.toLowerCase()}" (${Math.round(t[0].share * 100)}%).${bf ? ` Suggest ${P(bf).title} instead.` : ""}`,
        evidence: [
          { label: "Return rate, this context", value: `${Math.round(ctx.return_rate * 100)}% (${ctx.returns}/${ctx.units})` },
          { label: "Return rate, overall", value: `${Math.round(e.return_rate * 100)}%` },
          { label: "Top reasons", value: t.slice(0, 2).map((x) => `${x.label} ${Math.round(x.share * 100)}%`).join(", ") },
        ],
        examples: e.reasons_raw.filter((x) => x.use_context === "office").slice(0, 3).map((x) => x.text),
        confidence: 0.77,
        impact: "Fewer returns in this context; kept revenue per click up",
        apply: { action: "exclude_from_rail", ad_group_id: agId, sku: it.sku, replace_with: bf },
      });
    }
  }
  // pause context: weakest ad group by kept revenue per click
  const rows = db.adGroups.filter((g) => g.status === "active").map((g) => ({ g, s: slice(os, byAdGroup(g.id)) }));
  const avg = slice(os, (s) => s.channel === "chatgpt_ads").keptPerClick;
  const weak = rows.sort((a, b) => a.s.keptPerClick - b.s.keptPerClick)[0];
  if (weak && weak.s.keptPerClick < avg * 0.75) {
    const c = slice(os, byAdGroup(weak.g.id, "C")), a = slice(os, byAdGroup(weak.g.id, "A"));
    list.push({
      id: `prop-pause-${weak.g.id}`,
      type: "pause_context",
      title: `Pause the agent on "${weak.g.name}" and test a jhumka-first page`,
      summary: `This context keeps ₹${Math.round(weak.s.keptPerClick)} per click vs ₹${Math.round(avg)} across ChatGPT ads. The agent adds little here (₹${Math.round(c.keptPerClick)} vs ₹${Math.round(a.keptPerClick)} on the standard page), so spend it where it lifts kept revenue.`,
      evidence: [
        { label: "Kept revenue / click", value: `₹${Math.round(weak.s.keptPerClick)} (avg ₹${Math.round(avg)})` },
        { label: "Agent vs standard page", value: `₹${Math.round(c.keptPerClick)} vs ₹${Math.round(a.keptPerClick)}` },
        { label: "Return + RTO rate", value: `${Math.round(weak.s.returnRtoRate * 100)}%` },
      ],
      examples: [],
      confidence: 0.58,
      impact: "Agent cost saved; rail-only page for this context",
      apply: { action: "pause_agent_for_context", ad_group_id: weak.g.id },
    });
  }
  out("proposals.json", S.ProposalsSchema.parse({ producer: producer("proposals", "proposals-v1"), proposals: list }));
}

(async () => {
  console.log(`pipelines (${useLlm ? "LLM: claude-opus-5-5" : "heuristic fallback"})`);
  const enriched = await enrich();
  const cls = await classifyReturns();
  const clusters = await clusterIntents();
  const rails = await railsAndOpeners(enriched);
  proposals(enriched, clusters, cls, rails);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
