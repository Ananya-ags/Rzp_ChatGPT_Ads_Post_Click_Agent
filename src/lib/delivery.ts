/**
 * Delivery dates, computed in code from stock, dispatch days and transit (never by the LLM).
 * Days are calendar days (couriers run Sundays); warehouse holidays push the ship date only.
 */
import type { Logistics, Product } from "./schemas";

export function addDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** IST calendar date + "HH:MM" for an instant. */
export function istParts(now: Date): { date: string; time: string } {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const iso = ist.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

export function formatDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }); // "Fri, 16 Oct"
}

export function shortDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }); // "16 Oct"
}

export function zoneFor(pincode: string, logistics: Logistics) {
  const match = [...logistics.zones].sort((a, b) => b.prefix.length - a.prefix.length).find((z) => pincode.startsWith(z.prefix));
  return match ?? { prefix: "", city: "Rest of India", zone: "national", transit_days: logistics.default_transit_days };
}

export type DeliveryEstimate = {
  sku: string;
  pincode: string;
  city: string;
  in_stock: boolean;
  made_to_order: boolean;
  dispatch_days: number;
  ships_on: string;
  transit_days: number;
  arrives_on: string;
  meets_deadline: boolean | null;
  explanation: string;
};

export function estimateDelivery(
  product: Product,
  pincode: string,
  logistics: Logistics,
  now: Date,
  deadline?: string | null,
): DeliveryEstimate {
  const j = product.metafields.jewellery;
  const stock = product.variants.reduce((s, v) => s + v.inventory_quantity, 0);
  const inStock = stock > 0;
  const wh = logistics.warehouses[0];
  const { date: today, time } = istParts(now);

  // An order placed before the cutoff counts today as dispatch day 0.
  const orderDay = time < wh.cutoff_ist ? today : addDays(today, 1);
  let dispatchDays = j.dispatch_days;
  if (!inStock && !j.made_to_order) dispatchDays = Math.max(dispatchDays, 7); // restock lead time
  let ships = addDays(orderDay, dispatchDays);
  const holidays = new Set(logistics.holidays.map((h) => h.date));
  while (holidays.has(ships)) ships = addDays(ships, 1);

  const zone = zoneFor(pincode, logistics);
  const arrives = addDays(ships, zone.transit_days);
  const meets = deadline ? arrives <= deadline : null;

  const why = j.made_to_order
    ? `made to order, dispatches in ${j.dispatch_days} days`
    : inStock
      ? "in stock, ships today from Jaipur"
      : "restocking";
  return {
    sku: product.handle,
    pincode,
    city: zone.city,
    in_stock: inStock,
    made_to_order: j.made_to_order,
    dispatch_days: dispatchDays,
    ships_on: ships,
    transit_days: zone.transit_days,
    arrives_on: arrives,
    meets_deadline: meets,
    explanation: `${why}; ${zone.transit_days}-day transit to ${zone.city}`,
  };
}
