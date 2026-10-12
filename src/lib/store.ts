/** Server-side data for the store home and category pages: the full catalogue, grouped by category, in file order. */
import "server-only";
import { getDb } from "./data";
import { categoriesFrom } from "./catalog";
import { toCard } from "./view";

export const SIMULATED_NOTE = "Cosmos is a fictional brand. Prices, ratings and stock are simulated for this prototype.";

export function storeData() {
  const db = getDb();
  const categories = categoriesFrom(db.products);
  const cards = Object.fromEntries(db.products.map((p) => [p.handle, toCard(p, db.manifest)]));
  const sections = categories.map((c) => ({
    slug: c.slug,
    label: c.label,
    cards: db.products.filter((p) => p.metafields.jewellery.category === c.category).map((p) => cards[p.handle]),
  }));
  const shippingNote = `Free shipping over ₹${db.brand.policies.free_shipping_threshold_inr.toLocaleString("en-IN")}`;
  return { categories, cards, sections, shippingNote };
}
