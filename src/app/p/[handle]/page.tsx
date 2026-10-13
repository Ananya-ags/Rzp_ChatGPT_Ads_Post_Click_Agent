import { notFound } from "next/navigation";
import PhoneFrame from "@/components/PhoneFrame";
import ProductPage, { type ProductPageProps } from "@/components/shop/ProductPage";
import { getDb, resolveAdGroup } from "@/lib/data";
import { estimateDelivery, formatDay } from "@/lib/delivery";
import { toCard } from "@/lib/view";
import { getUser, personaliseRail } from "@/lib/user";
import { searchCatalog } from "@/lib/tools/core";
import ConsoleEmit, { type PageEvent } from "@/components/console/ConsoleEmit";
import { curatedOpener } from "@/lib/openers";

type Props = { params: Promise<{ handle: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const RAIL_TITLE: Record<string, string> = {
  "waterproof-everyday-under-5k": "Picked for waterproof everyday",
  "wedding-guest-gift": "Picked for the wedding",
  "office-minimal": "Picked for the office",
  "stainless-steel-earrings": "Stainless steel earrings",
};

export async function generateMetadata({ params }: Props) {
  const { handle } = await params;
  const p = getDb().products.find((x) => x.handle === handle);
  return { title: p ? `${p.title} · Cosmos` : "Cosmos" };
}

export default async function Page({ params, searchParams }: Props) {
  const { handle } = await params;
  const sp = await searchParams;
  const db = getDb();
  const product = db.products.find((p) => p.handle === handle);
  if (!product) notFound();

  const group = resolveAdGroup({ ad_group_id: one(sp.ad_group_id), ad_group: one(sp.ad_group) });
  // No ad group = direct visit (store home, category page, shared link): same page, agent on, no ad context.
  // Opened from a sponsored card (utm_source/oppref) → render inside the in-app browser chrome; product links keep it.
  const viaChatgpt = !!group && (one(sp.utm_source) === "chatgpt" || !!one(sp.oppref) || one(sp.via) === "chatgpt");
  const backConv = group ? db.mock.conversations.find((c) => c.ad_group === group.id)?.id : undefined;
  const armParam = one(sp.arm)?.toUpperCase();
  const arm: "A" | "B" | "C" = armParam === "A" || armParam === "B" || armParam === "C" ? armParam : "C";
  const j = product.metafields.jewellery;
  const cards = Object.fromEntries(db.products.map((p) => [p.handle, toCard(p, db.manifest)]));

  // logged in (demo persona): exact saved address; otherwise tier 0 approx city from IP → Pune
  const user = await getUser();
  const area = user ? user.address.line1.split(",").pop()!.trim() : null;
  const est = estimateDelivery(product, user?.address.pincode ?? "411038", db.logistics, db.now);
  // Shopper-friendly product details (verified fields only): finish and warranty first, plain words, no micron jargon.
  const FINISH: Record<string, string> = { "18k gold plating": "18K gold plated", "gold vermeil": "Gold vermeil (gold on silver)", rhodium: "Rhodium plated" };
  const METAL: Record<string, string> = { "stainless steel": "Stainless steel", "925 silver": "Sterling silver", brass: "Brass" };
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const facts: ProductPageProps["facts"] = [
    { label: "Finish", value: j.plating ? FINISH[j.plating] ?? cap(j.plating) : "Gold-toned" },
    j.anti_tarnish_warranty_months ? { label: "Warranty", value: `${j.anti_tarnish_warranty_months}-month anti-tarnish` } : null,
    { label: "Metal", value: METAL[j.base_metal] ?? cap(j.base_metal) },
    j.water_resistant === true ? { label: "Water", value: "Water-resistant" } : null,
    // one size per earring (sizing.earrings): diameter for hoops, huggies and studs; length for drops and danglers
    j.category === "earrings"
      ? j.outer_diameter_cm ? { label: "Diameter", value: `${j.outer_diameter_cm}cm` } : j.drop_length_cm ? { label: "Length", value: `${j.drop_length_cm}cm` } : null
      : j.outer_diameter_cm ? { label: "Size", value: `${j.outer_diameter_cm}cm` } : null,
    j.chain_length_cm ? { label: "Length", value: `${j.chain_length_cm}cm${j.extender_cm ? ` + ${j.extender_cm}cm extender` : ""}` } : null,
    j.ring_size ? { label: "Ring sizes", value: j.ring_size } : j.adjustable ? { label: "Fit", value: "Adjustable" } : null,
    j.closure ? { label: "Closure", value: cap(j.closure) } : null,
    j.weight_g ? { label: "Weight", value: `${j.weight_g}g${j.category === "earrings" ? " (pair)" : ""}` } : null,
  ].filter(Boolean) as ProductPageProps["facts"];

  // icon row: each badge only when it is a verified fact for this product.
  const freeShip = db.brand.policies.free_shipping_threshold_inr;
  const badges: ProductPageProps["badges"] = [
    j.anti_tarnish_warranty_months ? { icon: "shield" as const, label: "Anti-tarnish", sub: `${j.anti_tarnish_warranty_months}-month warranty` } : null,
    j.plating === "18k gold plating" ? { icon: "gold" as const, label: "18K gold plated", sub: `On ${(METAL[j.base_metal] ?? j.base_metal).toLowerCase()}` } : j.plating === "gold vermeil" ? { icon: "gold" as const, label: "Gold vermeil", sub: "On sterling silver" } : null,
    { icon: "truck" as const, label: "Free shipping", sub: Number(product.variants[0].price) >= freeShip ? "On this item" : `Over ₹${freeShip.toLocaleString("en-IN")}` },
  ].filter(Boolean) as ProductPageProps["badges"];

  // ad visit: the curated rail for the ad group; direct visit: "You may also like", same-category neighbours
  // computed in code (search_catalog's similar_to ranking, not personalised)
  const railBase = group
    ? db.rails.rails[group.id]?.items ?? []
    : searchCatalog(db, "", { similar_to: handle, category: j.category, limit: 4 }).results.map((r) => ({ sku: r.sku, reason: "", pinned: false }));
  // personalised for the logged-in shopper: drop what she owns, favour her sizes, add a chain for her pendant
  const railRaw =
    group && user
      ? personaliseRail(railBase.map((r) => r.sku), group.candidate_skus, group.hero_sku, user, db.rules.rail_size).map((sku) => ({ sku, reason: "", pinned: railBase.find((r) => r.sku === sku)?.pinned ?? false }))
      : railBase;
  const linkQuery = group ? `?ad_group=${group.id}${armParam ? `&arm=${arm}` : ""}${viaChatgpt ? "&via=chatgpt" : ""}` : armParam ? `?arm=${arm}` : "";
  const opener = group ? db.openers.openers[group.id] : null;
  const more = db.products
    .filter((p) => p.handle !== handle && p.metafields.jewellery.category === j.category && !p.metafields.jewellery.excluded)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 5)
    .map((p) => cards[p.handle]);

  const props: ProductPageProps = {
    arm,
    hero: cards[handle],
    bodyHtml: product.body_html,
    facts,
    badges,
    reviews: j.review_snippets,
    arrives: { label: formatDay(est.arrives_on), where: user ? `${area}, ${user.address.city} ${user.address.pincode}` : `${est.city} (approx.)`, madeToOrder: j.made_to_order, dispatchDays: j.dispatch_days },
    user: user ? { firstName: user.firstName, nudgePrepaid: user.rtoRisk === "high", pincode: user.address.pincode } : null,
    loginHref: `/login?next=${encodeURIComponent(`/p/${handle}${linkQuery}`)}`,
    // ad visit: the hero gets the ad's opener from openers.json (the AI line where its guard passed, otherwise the
    // curated line; the pipeline stores whichever was used); other products get the curated product line
    context:
      group && opener
        ? { adGroupId: group.id, chip: opener.chip, opener: handle === group.hero_sku ? opener.opener : `${user ? "Welcome back. " : ""}Any questions about the ${product.title}? Ask about size, materials, delivery or gifting.`, railTitle: user ? "Picked for you" : RAIL_TITLE[group.id] ?? "Picked for you", pending: group.status !== "active" }
        : !group
          ? { adGroupId: null, chip: null, opener: `${user ? "Welcome back. " : ""}Questions about the ${product.title}? Ask about size, materials, delivery or returns.`, railTitle: "You may also like", pending: false }
          : null,
    rail: railRaw.map((r) => ({ card: cards[r.sku], reason: r.reason, pinned: r.pinned })),
    more,
    cards,
    linkQuery,
    simulatedNote: "Reviews, ratings and stock are simulated for this prototype. Cosmos is a fictional brand.",
  };

  // AI console (/demo): this page's decisions with where each came from. Emitted only when the console listens.
  const consoleEvents: PageEvent[] = [];
  const ev = (e: Omit<PageEvent, "journey_step">) => consoleEvents.push({ journey_step: "page", ...e });
  if (arm !== "C") {
    ev({ kind: "agent_off", title: `Agent off on this arm (${arm}), standard page shown`, detail: arm === "A" ? "Control arm A: no ad context, no curated rail, no Cosmos AI" : "Arm B: curated page without Cosmos AI", source: "rule", status: "info", data: { arm } });
  }
  if (arm !== "A" && props.context) {
    const railSource = group ? db.rails.producer : null;
    const baseSkus = railBase.map((r) => r.sku);
    for (const [i, r] of railRaw.entries()) {
      const base = railBase.find((b) => b.sku === r.sku);
      const fromGroup = !!group;
      const added = group && user && !baseSkus.includes(r.sku);
      const pinned = r.pinned;
      const owned = user?.ownedSkus.some((o) => db.products.find((x) => x.handle === o)?.metafields.jewellery.subtype === "pendant") && db.products.find((x) => x.handle === r.sku)?.metafields.jewellery.subtype === "chain";
      ev({
        kind: "rail",
        title: `Rail ${i + 1}: ${db.products.find((x) => x.handle === r.sku)?.title ?? r.sku}`,
        detail: pinned ? "Pinned to slot 1 by the brand" : added ? (owned ? "Added: goes with the pendant she owns" : "Added from the ad group's candidates (AI-matched offline)") : fromGroup ? base?.reason || "AI-curated for this ad" : "Same-category neighbour (search_catalog similar_to)",
        source: pinned ? "rule" : added ? "login" : fromGroup ? "ai" : "code",
        status: "ok",
        data: { sku: r.sku, ...(fromGroup && railSource ? { producer: `${railSource.mode} · ${railSource.model ?? ""} · ${railSource.prompt_version}` } : {}) },
      });
    }
    if (group) for (const rule of db.rails.rails[group.id]?.rules_applied ?? []) if (rule.action !== "pinned") ev({ kind: "rail_rule", title: `Brand rule: ${rule.action} ${db.products.find((x) => x.handle === rule.sku)?.title ?? rule.sku}`, detail: rule.why, source: "rule", status: "info", data: { sku: rule.sku } });
    if (group && user) {
      for (const sku of baseSkus.filter((h) => !railRaw.some((r) => r.sku === h))) {
        const t = db.products.find((x) => x.handle === sku);
        const reason = user.ownedSkus.includes(sku) ? "she already owns it" : (t?.metafields.jewellery.outer_diameter_cm ?? t?.metafields.jewellery.drop_length_cm ?? 0) > 3 ? "over her size preference (3cm)" : "rail size";
        ev({ kind: "rail_rule", title: `Removed ${t?.title ?? sku}`, detail: `Login: ${reason}`, source: "login", status: "info", data: { sku } });
      }
    }
    // opener: AI-written vs the curated fallback, and why
    const curated = group && opener && handle === group.hero_sku ? curatedOpener(group.id, product) : null;
    ev({
      kind: "opener",
      title: group && opener && handle === group.hero_sku ? (opener.opener === curated ? "Opener: curated fallback" : "Opener: AI-written") : "Opener: curated product line",
      detail: group && opener && handle === group.hero_sku
        ? opener.opener === curated
          ? "The AI line failed the opener guard (≤25 words, no spec list, no health claim, no off-context water), so the curated line is used"
          : `Passed the opener guard · ${db.openers.producer.model ?? ""} ${db.openers.producer.prompt_version}`
        : group ? "Only the ad's hero product has an AI opener; other pieces get the curated line" : "Direct visit: the product-generic line",
      source: group && opener && handle === group.hero_sku && opener.opener !== curated ? "ai" : "rule",
      status: "ok",
    });
  }

  return (
    <PhoneFrame
      chrome={viaChatgpt ? { kind: "webview", backHref: `/chatgpt${backConv ? `?c=${backConv}` : ""}`, domain: "cosmos.example" } : undefined}
      label={`Shopper view · arm ${arm}${group ? ` · ad group: ${group.name}` : arm === "A" ? " · standard page" : " · direct visit (no ad)"}${one(sp.oppref) ? ` · oppref ${one(sp.oppref)}` : ""}`}>
      <ProductPage key={handle} {...props} />
      <ConsoleEmit id={`${handle}|${group?.id ?? ""}|${arm}|${user ? 1 : 0}`} page={`Product: ${product.title}`} events={consoleEvents} agentPausable={arm === "C"} />
    </PhoneFrame>
  );
}
