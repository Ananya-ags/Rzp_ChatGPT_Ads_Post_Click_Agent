/**
 * Intent rules decided in code, not by the LLM.
 * - Fast path: exact suggested-chip text (normalised) is answered from tools + templates with zero LLM calls.
 *   Free text always goes to the model.
 * - Forced tool: for routed intents the model must call the tool on step 1, so its first answer rests on a tool
 *   result. Order: offers (so "cash on delivery" is an offer question), care triggers (handoff), add to bag,
 *   store policy, delivery, fit for an occasion.
 * - Input limits: text only, at most MAX_MESSAGE_CHARS characters.
 */
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

export const MAX_MESSAGE_CHARS = 500;
export const TEXT_ONLY_REPLY = "I can only read text messages. Could you type your question instead?";
export const TOO_LONG_REPLY = "That's a bit long, could you shorten it?";

/** Lookup chips with a templated answer. Judgement chips ("Will these work for office?") go to the model. */
export const FAST_PATH_CHIPS = new Set(
  [
    "When will it be delivered?",
    "Any offers?",
    "Any offers on this?",
    "Koi offer hai kya?",
    "Can I pay cash on delivery?",
    "COD available?",
    "Is gift wrap available?",
    "Show me other products",
    "What metal is this?",
    "Is it nickel-free?",
    "Are these nickel free?",
    "Find a gift",
    "Waterproof pieces",
    "Under ₹2,000",
    "Delivery & returns",
  ].map(norm),
);
export const isFastPath = (text: string) => FAST_PATH_CHIPS.has(norm(text));

export const OFFER = /\b(offers?|discounts?|coupons?|promo|codes?|deals?|sale|cheaper|price ?match|cashback|cod|cash on delivery)\b|\d+\s?%|% ?off|\bpercent\b/i;
export const DELIVERY =
  /\b(deliver(y|ed|s)?|arriv(e|es|al|ing)|reach(es)?|ship(s|ping|ped)?|dispatch(es|ed)?|pincode|when will|how soon|how many days|how long (will|does|would|to)[^?]{0,25}\b(take|deliver|arrive|ship|reach|come|get here)|kab|milega|aayega|tak aa)\b|\bby\s+(\d{1,2}(st|nd|rd|th)?\b|mon|tue|wed|thu|fri|sat|sun|tomorrow|next)|\b\d{1,2}\s?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b|\b\d{6}\b/i;

// G16 care triggers → handoff first: nickel/allergy (medical-adjacent), customisation, order status, a person
export const ALLERGY = /\b(nickel|allerg(y|ic|ies)|hypo-?allergenic|sensitive|itch(y|ing)?|khujli|rash|irritat(e|ion)|react(ion)?s?)\b/i;
// a person, not the bot → handoff with a direct way to reach the team
export const HUMAN = /\b(talk|speak|chat) (to|with) (a |an |someone|somebody|a real |the )?(person|human|agent|someone|somebody|team|executive)|\breal person\b|\bhuman\b|\bcall me\b|\bcall back\b|\bcustomer (care|service)\b|\bkisi (insaan|aadmi) se baat\b/i;
// medical questions → handoff: no medical advice, a doctor, then the care team
export const MEDICAL = /\b(pregnan\w*|allerg\w*|rash\w*|persistent itch\w*|itch\w* (that )?(persists|won'?t stop|for days)|infect\w*|swell\w*|swollen|surgery|surgical|mri|x-?rays?|skin condition|eczema|dermatitis|psoriasis|doctor|medicine|medication)\b/i;
/** Which care message the handoff gives: allergy words (nickel, sensitive ears) win over general medical ones. */
export function handoffKind(text: string): "human" | "medical" | "allergy" | "unknown" {
  if (HUMAN.test(text)) return "human";
  if (/\b(nickel|hypo-?allergenic|sensitive|khujli|itch(y|ing)?)\b/i.test(text)) return "allergy";
  if (MEDICAL.test(text)) return "medical";
  if (ALLERGY.test(text)) return "allergy";
  return "unknown";
}
const CARE = /\b(engrav(e|ing)|customi[sz](e|ed|ation)|personali[sz](e|ed)|monogram|initials|my order|order (status|id)|track(ing)?|where is my|refund status|cancel my|talk to (a |an )?(person|human|agent|someone)|speak to|real person|customer (care|service)|call me)\b/i;
// "will these work for office / a wedding?" → return insight decides if the fit is right (return prevention)
const FIT = /\b(work|wear|suit(able|s)?|good|ok(ay)?|fine|right|appropriate|chalega|pehen)\b[^?]*\b(office|work|wedding|party|interview|college|daily|everyday|festive)\b|\b(office|wedding)\b[^?]*\b(work|suit|ok(ay)?|fine|good|chalega|pehen)/i;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** "by 18 Oct" / "before 20th October" → YYYY-MM-DD on or after the demo clock's date; null if no date is given. */
export function parseDeadline(text: string, now: Date): string | null {
  const m = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase()), day = Number(m[1]);
  let year = now.getUTCFullYear();
  if (new Date(Date.UTC(year, month, day)) < new Date(Date.UTC(year, now.getUTCMonth(), now.getUTCDate()))) year++;
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// store policy questions → lookup_policy (returns, refunds, exchanges, shipping costs/abroad, warranty, care, gold, gifting)
export const POLICY = /\b(return(s|ed|ing)?|refund(s|ed)?|exchange|warranty|guarantee|care for|clean(ing)?|polish|real gold|solid gold|pure gold|hallmark(ed)?|international|abroad|outside india|overseas|ship(ping)? (to|outside|abroad)|shipping (charges?|fees?|cost)|delivery charges?|free shipping|gift ?wrap|gift (box|note|message)|gifting|cancel(lation)?|ring size|size chart|bulk|wholesale|corporate|loyalty|points|rewards?|subscription|subscribe|membership|stores?|showroom|outlet|visit (you|your)|emi|instal+ments?|pay later|resiz\w*|wapas|wapsi)\b/i;
// a clear request to add something to the bag (never inferred)
export const ADD_TO_BAG = /\b(add|put)\b[^?]*\b(bag|cart|basket)\b|\b(i'?ll take|i will take|buy (it|this|these|them|the)|order (it|this|these|them))\b/i;
// "what goes with what I own" (a login trigger)
export const OWNED = /\bwhat (goes|would go|matches) with\b|\b(pair|match) (it |them )?with (my|what i)\b|\bwhat i (own|have|bought)\b/i;
/** Quantity in "add two of these", "add 20 to my bag"; defaults to 1. */
export function parseQty(text: string): number {
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, ten: 10, a: 1, another: 1 };
  const m = text.match(/\b(\d{1,3}|one|two|three|four|five|six|ten)\b(?=\s*(x\s*)?(of|pairs?|pieces?|more|sets?|units?)?\b)/i);
  return m ? (Number(m[1]) || words[m[1].toLowerCase()] || 1) : 1;
}

export type ForcedTool = "get_offer" | "check_delivery" | "handoff" | "get_return_insight" | "lookup_policy" | "add_to_bag";

/** The tool the model must call first, or null. Needs a page product (the tools take or concern its SKU). */
export function forcedTool(text: string, hasPageProduct: boolean): ForcedTool | null {
  if (!hasPageProduct) return null;
  if (OFFER.test(text)) return "get_offer";
  if (ALLERGY.test(text) || MEDICAL.test(text) || HUMAN.test(text) || CARE.test(text)) return "handoff";
  if (ADD_TO_BAG.test(text)) return "add_to_bag";
  if (POLICY.test(text)) return "lookup_policy";
  if (DELIVERY.test(text)) return "check_delivery";
  if (FIT.test(text)) return "get_return_insight";
  return null;
}

/** A 6-digit pincode the shopper typed in any of their messages (so delivery isn't an "estimate for Pune"). */
export const typedPincode = (texts: string[]) => texts.map((t) => t.match(/\b[1-9]\d{5}\b/)?.[0]).filter(Boolean).at(-1) ?? null;

/** Hinglish (Hindi in Latin script): the agent replies in the same language. */
const HINGLISH_WORDS = /\b(hai|hain|kya|mein|ke|ki|ka|liye|aap|nahi|toh|ye|yeh|haan|bhi|wale|sakte|chalega|kab|tak|aayega|milega|koi|kitne|kaan|pehen|accha|acche|batao|chahiye)\b/gi;
export const isHinglish = (text: string) => (text.match(HINGLISH_WORDS) ?? []).length >= 2;

/** Stated preferences for quick answers without a model: "under ₹2,000", "for office", "by 18 Oct". */
export const PREFS = /\b(under|below|less than|within|up ?to|upto)\s*(₹|rs\.?|inr)?\s*\d[\d,]*|\bbudget\b|\bfor (the )?(office|work|wedding|a gift|gift|gifting|festive|diwali|everyday)\b/i;
export function parsePrefs(text: string, now: Date) {
  const budget = Number(text.match(/\b(?:under|below|less than|within|up ?to|upto|budget(?: of| is)?)\s*(?:₹|rs\.?|inr)?\s*(\d[\d,]*)/i)?.[1]?.replace(/,/g, "")) || undefined;
  const occ = text.match(/\bfor (?:the |a )?(office|work|wedding|gift|gifting|festive|diwali|everyday)\b/i)?.[1]?.toLowerCase();
  const occasion = occ ? ({ office: "office", work: "office", wedding: "wedding guest", gift: "gifting", gifting: "gifting", festive: "festive", diwali: "festive", everyday: "everyday" } as const)[occ as "office"] : undefined;
  const deadline = parseDeadline(text, now) ?? undefined;
  return Object.fromEntries(Object.entries({ budget_max_inr: budget, occasion, deadline }).filter(([, v]) => v !== undefined)) as { budget_max_inr?: number; occasion?: "office" | "wedding guest" | "gifting" | "festive" | "everyday"; deadline?: string };
}

