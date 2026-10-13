/**
 * Chat chips: rules, not AI. Every starter and follow-up chip is chosen here from the page type, the ad group and
 * the login state (starters), or from the last tool result (follow-ups). No model is involved, so the guided path
 * is instant, testable, and can never suggest an unsafe prompt (no discount demands, injections or test lines;
 * those live only in the eval cases). `npm run validate-data` checks every set (see scripts/validate-data.ts).
 *
 * Each chip says how it is answered:
 *   - fast:  a code template on the fast path (tool + template, no model call): `fastKey(text)` must match
 *   - model: a judgement chip; code forces its first tool (`forcedTool`) and the model streams the answer
 * Shared by the browser (chips) and the server (fast-path matching), so it has no server-only imports.
 */
import { DEMO_TODAY } from "@/config/demo";
import { norm } from "./intents";

export type PageKind = "product" | "home" | "category" | "bag";
export type AdGroupId = "waterproof-everyday-under-5k" | "wedding-guest-gift" | "office-minimal" | "stainless-steel-earrings";
export type ChipVia = { via: "fast" } | { via: "model"; tool: "get_return_insight" };
export type Chip = { text: string; requiresVerifiedWater?: boolean } & ChipVia;
export type ChipProduct = { handle: string; title: string; waterResistant: boolean };
export type ChipContext = { kind: PageKind; adGroupId: string | null; loggedIn: boolean; product: ChipProduct | null };

/* ───────────────────────── fast-path keys ───────────────────────── */

/** What a fast chip asks for. The route implements one template per key (an exhaustive switch). */
export type FastKey =
  | "delivery" | "offers" | "cod" | "gift_wrap" | "similar" | "metal" | "nickel" | "wedding_fit"
  | "size" | "materials" | "shower" | "tarnish" | "size_daily" | "smaller" | "matching" | "compare_sizes" | "owned"
  | "gift_under_2000" | "office_earrings" | "need_by_friday" | "waterproof_pieces" | "wedding_gifts" | "minimal_studs" | "steel_earrings"
  | "order_arrival" | "under_2000" | "arrive_by" | "add_named" | "faster" | "show_more"
  | "find_gift" | "delivery_returns";

const FAST: Record<string, FastKey> = {
  // product page
  "when will it be delivered": "delivery",
  "when will it arrive": "delivery",
  "any offers": "offers",
  "any offers on this": "offers",
  "koi offer hai kya": "offers",
  "can i pay cash on delivery": "cod",
  "cod available": "cod",
  "is gift wrap available": "gift_wrap",
  "can you gift wrap it": "gift_wrap",
  "show me other products": "similar",
  "show me similar pieces": "similar",
  "what metal is this": "metal",
  "is it nickelfree": "nickel",
  "is it nickel free": "nickel",
  "are these nickelfree": "nickel",
  "are these nickel free": "nickel",
  "is it good for a wedding": "wedding_fit",
  "suitable for wedding gift": "wedding_fit",
  "how big is it": "size",
  "how big do they look": "size",
  "what is it made of": "materials",
  "can i shower in these": "shower",
  "can i shower in it": "shower",
  "can i shower with these": "shower",
  "will they tarnish": "tarnish",
  "will it tarnish": "tarnish",
  "which size for daily wear": "size_daily",
  "which size is subtle": "smaller",
  "show matching pieces": "matching",
  "compare sizes": "compare_sizes",
  "what goes with what i own": "owned",
  // home and category
  "gift under 2000": "gift_under_2000",
  "officefriendly earrings": "office_earrings",
  "need it by friday": "need_by_friday",
  "waterproof everyday pieces": "waterproof_pieces",
  "wedding guest gifts": "wedding_gifts",
  "minimal studs for work": "minimal_studs",
  "stainless steel earrings": "steel_earrings",
  "find a gift": "find_gift",
  "waterproof pieces": "waterproof_pieces",
  "delivery  returns": "delivery_returns",
  // bag
  "when will my order arrive": "order_arrival",
  // follow-ups
  "under 2000": "under_2000",
  "show faster options": "faster",
  "show more": "show_more",
};

/** The fast-path key for a chip's text, or null (then it isn't a fast chip). */
export function fastKey(text: string): FastKey | null {
  const n = norm(text);
  if (FAST[n]) return FAST[n];
  if (/^will it arrive by (mon|tue|wed|thu|fri|sat|sun) \d{1,2} (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/.test(n)) return "arrive_by";
  if (/^add the .+ to (my )?bag$/.test(n)) return "add_named";
  return null;
}

/* ───────────────────────── dates from the demo clock ───────────────────────── */

const DAY = 86_400_000;
const today = () => new Date(`${DEMO_TODAY}T00:00:00Z`);
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Sat, 17 Oct": a fixed format (not Intl), so server and browser always produce the same chip text. */
export const dayLabel = (d: Date) => `${WD[d.getUTCDay()]}, ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
const label = dayLabel;
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Wedding chip date: today + 4 days on the demo clock (Tue 13 Oct → Sat, 17 Oct). */
export const weddingByDate = () => new Date(today().getTime() + 4 * DAY);
/** "Need it by Friday": the next Friday on the demo clock (Tue 13 Oct → Fri 16 Oct). */
export function nextFridayIso() {
  const t = today();
  return iso(new Date(t.getTime() + (((5 - t.getUTCDay() + 7) % 7) || 7) * DAY));
}

/* ───────────────────────── starter chips ───────────────────────── */

const fast = (text: string, extra: Partial<Chip> = {}): Chip => ({ text, via: "fast", ...extra }) as Chip;
const SHOWER = (text: string) => fast(text, { requiresVerifiedWater: true });

/** Product page, keyed by ad group ("direct" = no ad). */
const PRODUCT: Record<AdGroupId | "direct", () => Chip[]> = {
  "waterproof-everyday-under-5k": () => [SHOWER("Can I shower in these?"), fast("Will they tarnish?"), fast("Which size for daily wear?"), { text: "Will these work for office?", via: "model", tool: "get_return_insight" }],
  "wedding-guest-gift": () => [fast("Is it good for a wedding?"), fast("Can you gift wrap it?"), fast(`Will it arrive by ${label(weddingByDate())}?`), fast("Show matching pieces")],
  "office-minimal": () => [{ text: "Will these work for office?", via: "model", tool: "get_return_insight" }, fast("Which size is subtle?"), fast("When will it arrive?"), fast("Show me similar pieces")],
  "stainless-steel-earrings": () => [fast("What metal is this?"), fast("Is it nickel-free?"), fast("When will it be delivered?"), fast("Show me similar pieces")],
  direct: () => [fast("How big is it?"), fast("When will it arrive?"), fast("What is it made of?"), fast("Show me similar pieces"), SHOWER("Can I shower in it?")],
};

/** Home and category pages, keyed by the session's ad group. */
const BROWSE: Record<AdGroupId | "direct", Chip[]> = {
  direct: [fast("Gift under ₹2,000"), fast("Office-friendly earrings"), fast("Need it by Friday"), fast("Waterproof everyday pieces")],
  "waterproof-everyday-under-5k": [fast("Waterproof everyday pieces"), fast("Office-friendly earrings"), fast("Gift under ₹2,000"), fast("Need it by Friday")],
  "wedding-guest-gift": [fast("Wedding guest gifts"), fast("Gift under ₹2,000"), fast("Need it by Friday"), fast("Is gift wrap available?")],
  "office-minimal": [fast("Office-friendly earrings"), fast("Minimal studs for work"), fast("Gift under ₹2,000"), fast("Need it by Friday")],
  "stainless-steel-earrings": [fast("Stainless steel earrings"), fast("Office-friendly earrings"), fast("Gift under ₹2,000"), fast("Need it by Friday")],
};

const BAG: Chip[] = [fast("When will my order arrive?"), fast("Any offers?"), fast("Is gift wrap available?"), fast("Can I pay cash on delivery?")];
const OWNED: Chip = fast("What goes with what I own?");

const groupKey = (id: string | null): AdGroupId | "direct" => (id && id in BROWSE ? (id as AdGroupId) : "direct");

/** All starter chips for a context, before the product filter (the validator walks these). */
export function rawStarterChips(ctx: Omit<ChipContext, "product">): Chip[] {
  const base =
    ctx.kind === "product" ? PRODUCT[groupKey(ctx.adGroupId)]()
    : ctx.kind === "bag" ? (ctx.adGroupId === "wedding-guest-gift" ? [BAG[2], BAG[0], BAG[1], BAG[3]] : BAG)
    : BROWSE[groupKey(ctx.adGroupId)];
  // logged in: "What goes with what I own?" leads; the last chip drops
  return ctx.loggedIn ? [OWNED, ...base.slice(0, base.length - 1)] : base;
}

/** Starter chips for the current page: water chips only on a verified water-resistant product, at most 4. */
export function starterChips(ctx: ChipContext): Chip[] {
  return rawStarterChips(ctx)
    .filter((c) => !c.requiresVerifiedWater || ctx.product?.waterResistant === true)
    .slice(0, 4);
}

/** First line in an empty chat away from a product: echoes the session's ad, never names the platform. */
export function browseOpener(kind: PageKind, adGroupId: string | null): string {
  if (kind === "bag") return "Need it by a date, or want gift wrap? I can check delivery, offers and payment options.";
  const byAd: Record<AdGroupId, string> = {
    "waterproof-everyday-under-5k": "Still looking for waterproof everyday pieces? I can find them by budget or delivery date.",
    "wedding-guest-gift": "Shopping for a wedding? I can find gift-ready pieces and check they arrive in time.",
    "office-minimal": "Looking for office-friendly pieces? I can find minimal styles by size or budget.",
    "stainless-steel-earrings": "Looking for stainless steel earrings? I can show you what's steel all the way through.",
  };
  return byAd[groupKey(adGroupId) as AdGroupId] ?? "I can find pieces by occasion, budget or delivery date. What are you shopping for?";
}

/* ───────────────────────── follow-up chips ───────────────────────── */

/** The last answer's tools, as the client sees them (tool name + output). */
export type LastTool = { tool: string; output: Record<string, unknown> | null };

/**
 * 2–3 follow-ups chosen from the last tool, with the same page and safety rules as the starters.
 * `used` = texts the shopper already sent (hidden).
 */
export function followUpChips(last: LastTool[], ctx: ChipContext, used: Set<string>): string[] {
  const out: string[] = [];
  const has = (t: string) => last.findLast((x) => x.tool === t)?.output ?? null;
  const onProduct = ctx.kind === "product" && !!ctx.product;
  const delivery = has("check_delivery");
  const insight = has("get_return_insight");
  const careLine = has("handoff") || (has("lookup_policy") && has("lookup_policy")?.found === false);
  if (has("add_to_bag")) out.push(...(ctx.kind === "bag" ? ["When will my order arrive?"] : ["When will it arrive?", "Any offers?"]));
  else if (delivery) {
    if (delivery.meets_deadline === false) out.push("Show faster options");
    out.push("Any offers?");
  } else if (insight) {
    const alt = insight.alternative as { title?: string } | null;
    if (insight.relevant && alt?.title) out.push(`Add the ${alt.title} to bag`);
    if (onProduct) out.push("Compare sizes");
  } else if (has("get_offer")) {
    out.push("Can I pay cash on delivery?", ctx.kind === "bag" ? "When will my order arrive?" : "When will it arrive?");
  } else if (has("search_catalog")) {
    const search = has("search_catalog")!;
    if (search.count !== 0) out.push("Under ₹2,000");
    if (search.has_more !== false && search.count !== 0) out.push("Show more");
  } else if (careLine) {
    out.push(onProduct ? "Show me similar pieces" : "Gift under ₹2,000");
  }
  // same rules as the starters: a delivery/offer chip needs a product or a bag, never a water chip here
  return [...new Set(out)]
    .filter((t) => t === "Show more" || !used.has(norm(t)))
    .filter((t) => ctx.kind !== "home" && ctx.kind !== "category" ? true : !/^(when will it arrive|any offers|can i pay cash)/i.test(t))
    .slice(0, 3);
}

/** Every chip text the UI can show, for the validator (starters across all contexts + fixed follow-ups). */
export function allChipTexts(products: ChipProduct[]): { text: string; chip: Chip | null; where: string; product: ChipProduct | null }[] {
  const rows: { text: string; chip: Chip | null; where: string; product: ChipProduct | null }[] = [];
  const groups: (string | null)[] = [null, ...Object.keys(BROWSE).filter((k) => k !== "direct")];
  for (const adGroupId of groups)
    for (const loggedIn of [false, true]) {
      for (const kind of ["home", "category", "bag"] as const)
        for (const chip of rawStarterChips({ kind, adGroupId, loggedIn })) rows.push({ text: chip.text, chip, where: `${kind} · ${adGroupId ?? "direct"}${loggedIn ? " · logged in" : ""}`, product: null });
      for (const product of products)
        // every configured chip, not just the first 4 shown: only the runtime water filter applies
        for (const chip of rawStarterChips({ kind: "product", adGroupId, loggedIn }).filter((c) => !c.requiresVerifiedWater || product.waterResistant)) rows.push({ text: chip.text, chip, where: `product ${product.handle} · ${adGroupId ?? "direct"}${loggedIn ? " · logged in" : ""}`, product });
    }
  for (const t of ["Show faster options", "Any offers?", "Compare sizes", "Can I pay cash on delivery?", "When will it arrive?", "When will my order arrive?", "Under ₹2,000", "Show more", "Show me similar pieces", "Gift under ₹2,000"])
    rows.push({ text: t, chip: null, where: "follow-up", product: null });
  for (const p of products) rows.push({ text: `Add the ${p.title} to bag`, chip: null, where: "follow-up", product: p });
  return rows;
}
