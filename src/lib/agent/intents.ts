/**
 * Intent rules decided in code, not by the LLM.
 * - Fast path: exact suggested-chip text (normalised) is answered from tools + templates with zero LLM calls.
 *   Free text always goes to the model.
 * - Forced tool: for routed intents the model must call the tool on step 1, so its first answer rests on a tool
 *   result. Order: offers (so "cash on delivery" is an offer question), delivery, allergy, fit for an occasion.
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

const OFFER = /\b(offers?|discounts?|coupons?|promo|codes?|deals?|sale|cheaper|price ?match|cashback|emi|cod|cash on delivery)\b|\d+\s?%|% ?off|\bpercent\b/i;
const DELIVERY =
  /\b(deliver(y|ed|s)?|arriv(e|es|al|ing)|reach(es)?|ship(s|ping|ped)?|dispatch(es|ed)?|pincode|when will|how (soon|long|many days)|kab|milega|aayega|tak aa)\b|\bby\s+(\d{1,2}(st|nd|rd|th)?\b|mon|tue|wed|thu|fri|sat|sun|tomorrow|next)|\b\d{1,2}\s?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b|\b\d{6}\b/i;

// G16 care triggers → handoff first: nickel/allergy (medical-adjacent), customisation, order status, a person
export const ALLERGY = /\b(nickel|allerg(y|ic|ies)|hypo-?allergenic|sensitive (ears?|skin)|itch(y|ing)?|rash|irritat(e|ion)|react(ion)?s?)\b/i;
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

export type ForcedTool = "get_offer" | "check_delivery" | "handoff" | "get_return_insight";

/** The tool the model must call first, or null. Needs a page product (the tools take or concern its SKU). */
export function forcedTool(text: string, hasPageProduct: boolean): ForcedTool | null {
  if (!hasPageProduct) return null;
  if (OFFER.test(text)) return "get_offer";
  if (DELIVERY.test(text)) return "check_delivery";
  if (ALLERGY.test(text) || CARE.test(text)) return "handoff";
  if (FIT.test(text)) return "get_return_insight";
  return null;
}
