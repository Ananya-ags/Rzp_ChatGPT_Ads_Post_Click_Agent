/**
 * Guardrail layers: input (injection patterns, strip personal data from logs) → tools (caps + verified flags,
 * in tools/core.ts) → output (claim checker: numbers must be grounded, banned phrases, unverified claims) → handoff.
 */
import type { BrandRules, Product } from "../schemas";

const INJECTION = [/ignore (all |your |previous )?(rules|instructions)/i, /system prompt/i, /^\s*system\s*:/im, /pretend (you('| a)re|to be)/i, /developer mode/i, /discount\s*=\s*\d+/i, /you are now/i];

export function inputCheck(text: string) {
  const hits = INJECTION.filter((re) => re.test(text)).map((re) => re.source);
  return { injection: hits.length > 0, patterns: hits };
}

/** Mask phone numbers / emails / card-like digit runs before anything is logged. */
export function redact(text: string) {
  return text
    .replace(/\b\d{12,19}\b/g, "[card]")
    .replace(/(\+91[\s-]?)?[6-9]\d{9}\b/g, "[phone]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]");
}

export type OutputCheck = { name: string; pass: boolean; detail: string };

/**
 * G12 regulated claims. A regulated word is flagged unless the words just before it in the same sentence match
 * SAFE_HEDGES (an explicit allowlist, not "any negation"), or, for water/nickel, a verified flag backs it.
 */
export const REGULATED: { name: string; re: RegExp; backedBy?: "water_resistant" | "nickel_free" }[] = [
  { name: "hypoallergenic", re: /\bhypo-?allergenic\b/gi },
  { name: "nickel-free", re: /\b(?:100%\s+)?nickel[- ]free\b/gi, backedBy: "nickel_free" },
  { name: "waterproof", re: /\b(?:fully\s+|100%\s+)?(?:water-?proof|water[- ]resistant|shower-?proof|swim-?proof)\b/gi, backedBy: "water_resistant" },
  { name: "shower-safe", re: /\b(?:you can|safe to|fine to|ok(?:ay)? to) (?:shower|swim|bathe)\b|\bshower-?safe\b|\bsafe in the (?:shower|pool|sea)\b/gi, backedBy: "water_resistant" },
  { name: "water-safe", re: /\b(?:safe|fine|ok(?:ay)?) (?:with|in) water\b|\bwater[- ]safe\b|\b(?:showers?|swimming|bathing) (?:is|are) (?:safe|fine|ok(?:ay)?)\b/gi, backedBy: "water_resistant" },
  { name: "real/solid gold", re: /\b(?:real|solid|pure)\s+gold\b/gi },
  { name: "hallmarked", re: /\bhallmark(?:ed|ing)?\b/gi },
  { name: "BIS", re: /\bBIS\b/g },
  { name: "certified", re: /\bcertified\b/gi },
  { name: "safe for all skin", re: /\bsafe for (?:all|every|any)(?: kinds? of| types? of)? (?:skin|ears|one|body)\b|\bskin[- ]safe\b/gi },
  { name: "won't cause allergies", re: /\b(?:won'?t|will not|doesn'?t|does not|never) (?:cause|trigger|give you) (?:an? |any )?(?:allerg\w*|reactions?|rash\w*|irritation|itch\w*)/gi },
  { name: "medical claim", re: /\b(?:cures?|heals?|treats?|prevents?) (?:allerg\w*|rash\w*|infections?|irritation)/gi },
];
/** Safe hedges allowed right before a regulated word in the same sentence ("hasn't confirmed if these are …"). */
export const SAFE_HEDGES: RegExp[] = [
  /\b(?:hasn'?t|has not|haven'?t|have not)(?: been)? (?:confirmed|verified)\b/i,
  /\bnot (?:yet )?(?:confirmed|verified)\b/i,
  /\bunverified\b/i,
  /\b(?:is|are)n'?t\b/i,
  /\b(?:is|are) not\b/i,
  /\bnot described as\b/i,
  /\bwe (?:don'?t|do not) (?:call|describe|claim)\b/i,
  /\bnot (?:solid|real|pure) gold\b/i,
  /\b(?:can'?t|cannot|can not) (?:promise|say|guarantee|confirm)\b/i,
  /\bnot (?:hallmarked|certified)\b/i,
  /\bno (?:piece|product)s? (?:is|are)\b/i,
];

/** Regulated claims in a reply (an empty list = safe). `sources` = tool results + page facts, for verified flags. */
export function regulatedClaims(reply: string, sources: string, pageProduct: Product | null): string[] {
  const j = pageProduct?.metafields.jewellery;
  const flat = sources.replace(/\s/g, "");
  const backed = (field?: "water_resistant" | "nickel_free") => !!field && (j?.[field] === true || flat.includes(`"${field}":true`));
  const found: string[] = [];
  // A disclaimer before "but" does not qualify the reassurance that follows it.
  for (const sentence of reply.split(/(?<=[.!?;])\s+|\b(?:but|however|nevertheless)\b[:,]?\s*/i)) {
    for (const r of REGULATED) {
      for (const m of sentence.matchAll(r.re)) {
        const idx = m.index ?? 0;
        const window = sentence.slice(Math.max(0, idx - 70), idx + m[0].length); // words just before + the claim
        if (SAFE_HEDGES.some((h) => h.test(window))) continue;
        if (backed(r.backedBy)) continue;
        found.push(r.name);
      }
    }
  }
  return [...new Set(found)];
}

/**
 * Unknown facts: a reply asserting what Cosmos does or doesn't offer ("we have / don't have / offer …") must be
 * backed by a lookup_policy result in this turn that mentions the same topic. Returns the phrase and topic, or null.
 */
const POLICY_TOPICS = "loyalty|points?|rewards?|subscriptions?|memberships?|(?:physical |offline )?stores?|showrooms?|outlets?|engraving|custom\\w*|resiz\\w*|repairs?|emi|instal\\w*|pay later|gift cards?|cash on delivery|cod|international\\w*|express|same[- ]day";
export function policyAssertion(reply: string): { phrase: string; topic: string } | null {
  const m =
    reply.match(new RegExp(`\\b(?:we|cosmos)\\s+(?:currently\\s+|also\\s+)?(?:do not|don'?t|does not|doesn'?t|do|does)?\\s*(?:have|offer|provide|run|sell|support|accept)\\s+(?:a |an |any |the )?(?:${POLICY_TOPICS})\\b`, "i")) ??
    reply.match(new RegExp(`\\bthere(?: is| are|'s) no (?:${POLICY_TOPICS})\\b`, "i"));
  if (!m) return null;
  const topic = (m[0].match(new RegExp(`(?:${POLICY_TOPICS})$`, "i"))?.[0] ?? m[0]).toLowerCase().replace(/^(?:physical|offline) /, "");
  return { phrase: m[0], topic };
}
/** True if a lookup_policy text covers the asserted topic (singular stem match: "stores" ↔ "store"). */
export const policyCovers = (policyText: string, topic: string) => policyText.toLowerCase().includes(topic.replace(/s$/, "").slice(0, 7));

/** Self-contradiction: the reply opens with yes / haan / bilkul although get_return_insight's verdict is not_ideal. */
export const opensWithYes = (reply: string) => /^\s*(?:yes|yeah|yep|sure|absolutely|definitely|haan|ha+n ji|bilkul|zaroor)\b/i.test(reply);

/** Full and abbreviated month names denote the same date; neither changes the day or year. */
export const normalizeMonthNames = (text: string) => text.replace(
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/gi,
  (month) => month[0].toUpperCase() + month.slice(1, 3).toLowerCase(),
);

/** Numbers/dates in the reply must appear (as whole numbers, not substrings) in a tool result or the page's facts. */
export function outputChecks(reply: string, sources: string, rules: BrandRules, pageProduct: Product | null): OutputCheck[] {
  const checks: OutputCheck[] = [];
  // whole-number matching: "90" never matches inside "900", "0" never inside "90"
  const numbers = new Set((sources.replace(/,/g, "").match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))));
  const dateSources = normalizeMonthNames(sources);
  const tokens = normalizeMonthNames(reply).match(/₹\s?\d[\d,]*(?:\.\d+)?|\b\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b|\b\d+(?:\.\d+)?\s?(?:mm|cm|g|%)/g) ?? [];
  const ungrounded = tokens.filter((t) => {
    if (/[A-Z][a-z]{2}$/.test(t)) return !new RegExp(`(?<!\\d)${t}\\b`).test(dateSources);
    const bare = t.replace(/[₹,\s]/g, "").replace(/(mm|cm|g|%)$/, "");
    return !numbers.has(String(Number(bare)));
  });
  checks.push({ name: "claim check (numbers grounded)", pass: ungrounded.length === 0, detail: ungrounded.length ? `ungrounded: ${ungrounded.join(", ")}` : `${tokens.length} numbers grounded in tool results` });

  // shoppers get sizes in cm only (the agent quotes the code-computed "size" field)
  const mm = reply.match(/\b\d+(\.\d+)?\s?mm\b/gi) ?? [];
  checks.push({ name: "sizes in cm", pass: mm.length === 0, detail: mm.length ? `mm used: ${mm.join(", ")}` : "no mm sizes" });

  const banned = rules.banned_phrases.filter((b) => reply.toLowerCase().includes(b.toLowerCase()));
  checks.push({ name: "banned phrases", pass: banned.length === 0, detail: banned.length ? banned.join(", ") : "none" });

  // G12 regulated claims (see REGULATED / SAFE_HEDGES)
  const claims = regulatedClaims(reply, sources, pageProduct);
  checks.push({ name: "verified claims only", pass: claims.length === 0, detail: claims.length ? `unverified claim: ${claims.join(", ")}` : "ok" });
  return checks;
}
