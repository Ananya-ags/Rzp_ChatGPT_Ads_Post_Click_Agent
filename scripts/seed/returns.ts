/** 90-day return/RTO history. Planted SKUs are hand-written; the rest are seeded. */
import type { Product, ReturnsEntry } from "../../src/lib/schemas";
import { rng } from "../../src/lib/rng";
import { adGroups } from "./static";

type Ctx = "office" | "everyday" | "wedding" | "gifting" | "festive";
type R = [text: string, label: string, ag: string | null, ctx: Ctx | null];

const W = "waterproof-everyday-under-5k", WED = "wedding-guest-gift", OFF = "office-minimal";

const CIEL40: R[] = [
  ["Way bigger than the photo. Looked huge on me.", "size_bigger", W, "everyday"],
  ["Too big for office, my manager literally commented lol", "size_bigger", W, "office"],
  ["looked bigger than expected, wanted something subtle for work", "size_bigger", W, "office"],
  ["Size was much larger than I imagined. Returning for a smaller one", "size_bigger", W, "office"],
  ["Beautiful but too big for daily office wear", "size_bigger", null, "office"],
  ["Bahut bade the, office ke liye nahi chalenge", "size_bigger", W, "office"],
  ["hoops were too large for my face, felt like statement earrings", "size_bigger", W, "everyday"],
  ["4cm is BIG. Should have checked the size properly", "size_bigger", W, "office"],
  ["Looked huge on me, I'm petite", "size_bigger", WED, "everyday"],
  ["Too large and they kept getting caught in my hair", "size_bigger", W, "office"],
  ["way bigger than the photo on the model", "size_bigger", WED, "wedding"],
  ["Size dikhne mein chhota tha photo mein, actual mein bada hai", "size_bigger", W, "everyday"],
  ["Too big for meetings and video calls", "size_bigger", null, "office"],
  ["Larger than expected, exchanging for the 3cm", "size_bigger", W, "office"],
  ["Gift not liked by my friend", "gift_not_liked", WED, "gifting"],
  ["She already had similar hoops", "gift_not_liked", WED, "gifting"],
  ["gift ki thi, pasand nahi aaye", "gift_not_liked", WED, "gifting"],
  ["Changed my mind", "changed_mind", W, null],
  ["Ordered by mistake, wanted the huggies", "changed_mind", null, null],
  ["Latch felt a bit stiff to close", "quality", W, "everyday"],
];

const CIEL30: R[] = [
  ["Wanted something bigger for weekends", "size_smaller", W, "everyday"],
  ["Took longer to arrive than I needed", "late_delivery", OFF, "office"],
  ["Changed mind", "changed_mind", null, null],
  ["Colour slightly more yellow than my other jewellery", "colour", OFF, "office"],
];

const LAYERED: R[] = [
  ["Too long for my office shirts, the longest chain hangs weird", "too_long", OFF, "office"],
  ["Tangles every single time I take it off", "tangles", OFF, "office"],
  ["too long with collared shirts", "too_long", OFF, "office"],
  ["The 50cm one is too long, wanted it shorter", "too_long", OFF, "office"],
  ["Chains got tangled in the box itself", "tangles", null, "everyday"],
  ["Too long for formal wear", "too_long", OFF, "office"],
  ["bahut lamba hai, office mein awkward lagta hai", "too_long", OFF, "office"],
  ["Tangled within a day of wearing", "tangles", OFF, "office"],
  ["Too long and kept catching on my laptop bag strap", "too_long", OFF, "office"],
  ["Wanted a single chain instead", "changed_mind", null, "everyday"],
  ["Looked too much for work", "too_long", OFF, "office"],
  ["Clasp hard to open alone", "quality", null, "festive"],
];

const POOL: Record<string, string[]> = {
  earrings: ["Smaller than I expected", "Colour a bit more yellow than the photo", "Back kept falling off", "Didn't suit me", "Gift not liked", "Changed my mind", "Ordered two by mistake", "Color thoda alag tha photo se", "Too heavy for long wear", "Delivered late for the function"],
  necklace: ["Chain shorter than I thought", "Clasp is fiddly", "Pendant smaller than expected", "Didn't go with my outfit", "Changed my mind", "Gift not liked", "Chain thoda patla laga"],
  ring: ["Size didn't fit", "Too tight", "Too loose even after adjusting", "Changed my mind", "Size chart confusing tha", "Looked smaller on hand"],
  bracelet: ["Too loose on my wrist", "Too tight", "Changed my mind", "Gift not liked", "Clasp difficult"],
};

function ctxFor(occasion: string): Ctx {
  return occasion === "wedding guest" ? "wedding" : (occasion as Ctx);
}

export function buildReturns(products: Product[]): { file: { window_days: number; as_of: string; skus: ReturnsEntry[] }; labels: Record<string, string> } {
  const r = rng(90);
  const labels: Record<string, string> = {};
  const agFor = (sku: string) => adGroups.ad_groups.filter((g) => g.status === "active" && g.candidate_skus.includes(sku)).map((g) => g.id);
  let dateCursor = 0;
  const date = () => {
    dateCursor++;
    const d = new Date(Date.UTC(2026, 6, 15) + ((dateCursor * 7919) % 90) * 86400000);
    return d.toISOString().slice(0, 10);
  };
  const reasonsFrom = (sku: string, rs: R[]) =>
    rs.map(([text, label, ag, ctx], i) => {
      const id = `${sku}-r${i + 1}`;
      labels[id] = label;
      return { id, text, date: date(), ad_group_id: ag, use_context: ctx };
    });
  const rate = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 1000 : 0);

  const skus: ReturnsEntry[] = products.map((p) => {
    const h = p.handle;
    if (h === "ciel-hoops-40mm") {
      return {
        sku: h, units_sold: 240, returns: 41, rto: 9, return_rate: rate(41, 240), rto_rate: rate(9, 240),
        by_ad_group: { [W]: { units: 140, returns: 21, return_rate: rate(21, 140) }, [WED]: { units: 100, returns: 20, return_rate: rate(20, 100) } },
        by_use_context: { office: { units: 70, returns: 22, kept: 48 }, everyday: { units: 90, returns: 9, kept: 81 }, wedding: { units: 43, returns: 7, kept: 36 }, gifting: { units: 28, returns: 3, kept: 25 } },
        reasons_raw: reasonsFrom(h, CIEL40),
      };
    }
    if (h === "ciel-hoops-30mm") {
      return {
        sku: h, units_sold: 150, returns: 6, rto: 2, return_rate: rate(6, 150), rto_rate: rate(2, 150),
        by_ad_group: { [W]: { units: 60, returns: 3, return_rate: rate(3, 60) }, [OFF]: { units: 70, returns: 2, return_rate: rate(2, 70) } },
        by_use_context: { office: { units: 88, returns: 3, kept: 85 }, everyday: { units: 45, returns: 2, kept: 43 }, gifting: { units: 15, returns: 1, kept: 14 } },
        reasons_raw: reasonsFrom(h, CIEL30),
      };
    }
    if (h === "sol-layered-chain-set") {
      return {
        sku: h, units_sold: 250, returns: 20, rto: 5, return_rate: rate(20, 250), rto_rate: rate(5, 250),
        by_ad_group: { [OFF]: { units: 50, returns: 11, return_rate: rate(11, 50) } },
        by_use_context: { office: { units: 50, returns: 11, kept: 39 }, everyday: { units: 125, returns: 6, kept: 119 }, festive: { units: 70, returns: 3, kept: 67 } },
        reasons_raw: reasonsFrom(h, LAYERED),
      };
    }
    // seeded SKUs
    const j = p.metafields.jewellery;
    const units = r.int(40, 200);
    const rr = 0.03 + r.next() * 0.09;
    const returns = Math.max(3, Math.round(units * rr));
    const rto = Math.max(1, Math.round(units * (0.01 + r.next() * 0.03)));
    const delivered = units - rto;
    const ctxs = [...new Set(j.occasions.map(ctxFor))];
    const by_use_context: ReturnsEntry["by_use_context"] = {};
    let uLeft = delivered, rLeft = returns;
    ctxs.forEach((c, i) => {
      const last = i === ctxs.length - 1;
      const u = last ? uLeft : Math.round(delivered / ctxs.length);
      const ret = last ? rLeft : Math.min(rLeft, Math.round(returns / ctxs.length));
      uLeft -= u; rLeft -= ret;
      by_use_context[c] = { units: u, returns: ret, kept: u - ret };
    });
    const by_ad_group: ReturnsEntry["by_ad_group"] = {};
    for (const ag of agFor(h)) {
      const u = Math.round(units * 0.3);
      const ret = Math.round(u * rr * (0.8 + r.next() * 0.4));
      by_ad_group[ag] = { units: u, returns: ret, return_rate: rate(ret, u) };
    }
    const n = Math.min(returns, r.int(3, 8));
    const pool = POOL[j.category];
    const texts = r.shuffle(pool).slice(0, n);
    return {
      sku: h, units_sold: units, returns, rto, return_rate: rate(returns, units), rto_rate: rate(rto, units),
      by_ad_group, by_use_context,
      reasons_raw: texts.map((text, i) => ({ id: `${h}-r${i + 1}`, text, date: date(), ad_group_id: r.chance(0.5) ? (agFor(h)[0] ?? null) : null, use_context: r.chance(0.6) ? r.pick(ctxs) : null })),
    };
  });
  return { file: { window_days: 90, as_of: "2026-10-12", skus }, labels };
}
