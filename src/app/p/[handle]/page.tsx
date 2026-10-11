import { notFound } from "next/navigation";
import PhoneFrame from "@/components/PhoneFrame";
import ProductPage, { type ProductPageProps } from "@/components/shop/ProductPage";
import { getDb, resolveAdGroup } from "@/lib/data";
import { estimateDelivery, formatDay } from "@/lib/delivery";
import { toCard } from "@/lib/view";

type Props = { params: Promise<{ handle: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Fourth prompt tile on every agent page; answered with similar pieces (search_catalog). */
const SHOW_OTHERS = "Show me other products";

const RAIL_TITLE: Record<string, string> = {
  "waterproof-everyday-under-5k": "Picked for waterproof everyday",
  "wedding-guest-gift": "Picked for the wedding",
  "office-minimal": "Picked for the office",
  "hypoallergenic-studs": "Studs on titanium posts",
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
  const armParam = one(sp.arm)?.toUpperCase();
  const arm: "A" | "B" | "C" = armParam === "A" || armParam === "B" || armParam === "C" ? armParam : group ? "C" : "A";
  const j = product.metafields.jewellery;
  const cards = Object.fromEntries(db.products.map((p) => [p.handle, toCard(p, db.manifest)]));

  // tier 0: approx city from IP → Pune for the demo
  const est = estimateDelivery(product, "411038", db.logistics, db.now);
  // Shopper-friendly product details (verified fields only): finish and warranty first, plain words, no PVD/micron/316L jargon.
  const FINISH: Record<string, string> = { "18k gold PVD": "18K gold plated", "18k gold plating": "18K gold plated", "gold vermeil": "Gold vermeil (gold on silver)", rhodium: "Rhodium plated" };
  const METAL: Record<string, string> = { "316L stainless steel": "Stainless steel", "925 silver": "Sterling silver", brass: "Brass" };
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const facts: ProductPageProps["facts"] = [
    { label: "Finish", value: j.plating ? FINISH[j.plating] ?? cap(j.plating) : "Gold-toned" },
    j.anti_tarnish_warranty_months ? { label: "Warranty", value: `${j.anti_tarnish_warranty_months}-month anti-tarnish` } : null,
    { label: "Metal", value: METAL[j.base_metal] ?? cap(j.base_metal) },
    j.water_resistant === true ? { label: "Water", value: "Water-resistant" } : null,
    j.outer_diameter_mm ? { label: "Size", value: `${j.outer_diameter_mm}mm` } : null,
    j.drop_length_mm && j.category === "earrings" ? { label: "On the ear", value: `About ${j.drop_length_mm}mm long` } : null,
    j.chain_length_cm ? { label: "Length", value: `${j.chain_length_cm}cm${j.extender_cm ? ` + ${j.extender_cm}cm extender` : ""}` } : null,
    j.ring_size ? { label: "Ring sizes", value: j.ring_size } : j.adjustable ? { label: "Fit", value: "Adjustable" } : null,
    j.closure ? { label: "Closure", value: cap(j.closure) } : null,
    j.weight_g ? { label: "Weight", value: `${j.weight_g}g${j.category === "earrings" ? " (pair)" : ""}` } : null,
  ].filter(Boolean) as ProductPageProps["facts"];

  // icon row: each badge only when it is a verified fact for this product. "Skin safe" is added later in the demo,
  // when the merchant approves the hypoallergenic proposal (nickel_free is unverified until then).
  const freeShip = db.brand.policies.free_shipping_threshold_inr;
  const badges: ProductPageProps["badges"] = [
    j.anti_tarnish_warranty_months ? { icon: "shield" as const, label: "Anti-tarnish", sub: `${j.anti_tarnish_warranty_months}-month warranty` } : null,
    j.plating === "18k gold PVD" || j.plating === "18k gold plating" ? { icon: "gold" as const, label: "18K gold plated", sub: `On ${(METAL[j.base_metal] ?? j.base_metal).toLowerCase()}` } : j.plating === "gold vermeil" ? { icon: "gold" as const, label: "Gold vermeil", sub: "On sterling silver" } : null,
    { icon: "truck" as const, label: "Free shipping", sub: Number(product.variants[0].price) >= freeShip ? "On this item" : `Over ₹${freeShip.toLocaleString("en-IN")}` },
  ].filter(Boolean) as ProductPageProps["badges"];

  const railRaw = group ? db.rails.rails[group.id]?.items ?? [] : [];
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
    arrives: { label: formatDay(est.arrives_on), city: est.city, madeToOrder: j.made_to_order, dispatchDays: j.dispatch_days },
    context: group && opener ? { adGroupId: group.id, chip: opener.chip, opener: `Any questions about the ${product.title}?`, chips: [...opener.suggested_chips, SHOW_OTHERS], sheetChips: [...new Set([...opener.suggested_chips, SHOW_OTHERS, ...db.demo.try_it_chips.map((c) => c.text)])], railTitle: RAIL_TITLE[group.id] ?? "Picked for you", pending: group.status !== "active" } : null,
    rail: railRaw.map((r) => ({ card: cards[r.sku], reason: r.reason, pinned: r.pinned })),
    more,
    cards,
    linkQuery: group ? `?ad_group=${group.id}${armParam ? `&arm=${arm}` : ""}` : armParam ? `?arm=${arm}` : "",
    simulatedNote: "Reviews, ratings and stock are simulated for this prototype. Cosmos is a fictional brand.",
  };

  return (
    <PhoneFrame label={`Shopper view · arm ${arm}${group ? ` · ad group: ${group.name}` : " · standard page"}${one(sp.oppref) ? ` · oppref ${one(sp.oppref)}` : ""}`}>
      <ProductPage key={handle} {...props} />
    </PhoneFrame>
  );
}
