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

/** Numbers/dates in the reply must appear in a tool result or the page's verified facts. */
export function outputChecks(reply: string, sources: string, rules: BrandRules, pageProduct: Product | null): OutputCheck[] {
  const checks: OutputCheck[] = [];
  const src = sources.replace(/,/g, "");
  const tokens = reply.match(/₹\s?\d[\d,]*|\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b|\b\d+(\.\d+)?\s?(mm|cm|g|%)/g) ?? [];
  const ungrounded = tokens.filter((t) => {
    const bare = t.replace(/[₹,\s]/g, "").replace(/(mm|cm|g|%)$/, "");
    if (/[A-Z][a-z]{2}$/.test(t)) return !sources.includes(t);
    return !src.includes(bare);
  });
  checks.push({ name: "claim check (numbers grounded)", pass: ungrounded.length === 0, detail: ungrounded.length ? `ungrounded: ${ungrounded.join(", ")}` : `${tokens.length} numbers grounded in tool results` });

  // shoppers get sizes in cm only (the agent quotes the code-computed "size" field)
  const mm = reply.match(/\b\d+(\.\d+)?\s?mm\b/gi) ?? [];
  checks.push({ name: "sizes in cm", pass: mm.length === 0, detail: mm.length ? `mm used: ${mm.join(", ")}` : "no mm sizes" });

  const banned = rules.banned_phrases.filter((b) => reply.toLowerCase().includes(b.toLowerCase()));
  checks.push({ name: "banned phrases", pass: banned.length === 0, detail: banned.length ? banned.join(", ") : "none" });

  // G12 regulated claims: allowed only when a verified flag (page facts or a tool result) backs them, or when negated
  const j = pageProduct?.metafields.jewellery;
  const claims: string[] = [];
  const verifiedIn = (field: string) => new RegExp(`"${field}":true`).test(sources.replace(/\s/g, ""));
  const negated = (re: RegExp) => [...reply.matchAll(new RegExp(re.source, "gi"))].every((m) => /\b(not|no|never|isn't|aren't|don't|doesn't|can't|cannot|won't)\b[^.]{0,30}$/i.test(reply.slice(Math.max(0, (m.index ?? 0) - 40), m.index)));
  if (/\b(is|are|it's|they're)\s+(fully\s+|100%\s+)?(hypoallergenic|nickel[- ]free)/i.test(reply) && j?.nickel_free !== true && !verifiedIn("nickel_free")) claims.push("hypoallergenic/nickel-free");
  if (/\b(is|are|it's|they're)\s+(fully\s+|100%\s+)?(waterproof|water-resistant|shower-proof)/i.test(reply) && j?.water_resistant !== true && !verifiedIn("water_resistant") && !/not verified|isn't verified|unverified/i.test(reply)) claims.push("waterproof");
  for (const [name, re] of [["real/solid gold", /\b(real|solid|pure)\s+gold\b/], ["hallmark", /\b(hallmark(ed)?|BIS)\b/], ["certified", /\bcertified\b/]] as const)
    if (re.test(reply) && !negated(re)) claims.push(name); // no Cosmos piece is solid gold, hallmarked or certified
  checks.push({ name: "verified claims only", pass: claims.length === 0, detail: claims.length ? `unverified claim: ${claims.join(", ")}` : "ok" });
  return checks;
}
