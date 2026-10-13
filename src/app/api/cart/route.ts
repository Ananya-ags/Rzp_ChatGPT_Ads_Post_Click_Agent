/**
 * Bag pricing, computed on the server from the catalogue (never from the client): quantities are clamped to
 * stock and the per-order cap, offers come from the simulated Offers Engine with caps enforced in code.
 */
import { getDb } from "@/lib/data";
import { checkoutTotals, findProduct } from "@/lib/tools/core";
import { estimateDelivery, formatDay } from "@/lib/delivery";
import { MAX_PER_SKU } from "@/lib/view";
import { userFromRequest } from "@/lib/user";

type Body = { cart: { sku: string; qty: number }[]; giftWrap?: boolean; cod?: boolean };

export async function POST(req: Request) {
  const { cart = [], giftWrap = false, cod = false }: Body = await req.json();
  const db = getDb();
  const user = userFromRequest(req);
  const lines = cart
    .map((l) => {
      const p = findProduct(db, l.sku);
      if (!p) return null;
      const j = p.metafields.jewellery;
      const stock = p.variants.reduce((s, v) => s + v.inventory_quantity, 0);
      const max = j.made_to_order ? MAX_PER_SKU : Math.min(stock, MAX_PER_SKU);
      const qty = Math.max(0, Math.min(Math.floor(l.qty), max));
      return qty ? { sku: p.handle, qty, unit_inr: Number(p.variants[0].price), line_inr: Number(p.variants[0].price) * qty, made_to_order: j.made_to_order } : null;
    })
    .filter((l): l is NonNullable<typeof l> => !!l);

  const totals = checkoutTotals(db, lines.map((l) => ({ sku: l.sku, qty: l.qty })), { cod, gift_wrap: giftWrap, first_order: false, bank_card: false, logged_in: !!user, rto_risk: user?.rtoRisk });
  // the slowest item sets the delivery date: her saved address when logged in, else tier 0 approx city Pune
  const pin = user?.address.pincode ?? "411038";
  const arrivals = lines.map((l) => estimateDelivery(findProduct(db, l.sku)!, pin, db.logistics, db.now).arrives_on).sort();
  const arrives = arrivals.length ? arrivals[arrivals.length - 1] : null;
  const pol = db.brand.policies;
  const rzp = { emiMin: 3000 };
  return Response.json({
    lines,
    count: lines.reduce((s, l) => s + l.qty, 0),
    ...totals,
    free_shipping_threshold_inr: pol.free_shipping_threshold_inr,
    to_free_shipping_inr: Math.max(0, pol.free_shipping_threshold_inr - totals.subtotal_inr),
    gift_wrap_price_inr: pol.gift_wrap_inr,
    cod_fee_price_inr: pol.cod_fee_inr,
    arrives_label: arrives ? formatDay(arrives) : null,
    emi_available: totals.subtotal_inr > rzp.emiMin, // bags over ₹3,000
    // the pay-online nudge is only listed for the customer it targets
    available_offers: db.offers.filter((o) => o.id !== "prepaid_nudge" || (user && user.rtoRisk === "high")).map((o) => ({ id: o.id, label: o.label, applied: totals.applied.some((a) => a.id === o.id) || (o.type === "wallet" && totals.wallet.usable_inr > 0) })),
    user: user ? { firstName: user.firstName, phone: user.phoneMasked, email: user.emailMasked, address: user.address, paymentMethods: user.paymentMethods, nudgePrepaid: user.rtoRisk === "high" } : null,
  });
}
