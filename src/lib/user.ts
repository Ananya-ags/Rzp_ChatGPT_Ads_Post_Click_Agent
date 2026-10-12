/**
 * Demo login (simulated): a cookie set by /login after phone + OTP. The server reads it so pages render already
 * personalised. Only the demo persona exists; her data is assumed to be shareable with the store.
 */
import "server-only";
import { cookies } from "next/headers";
import { getDb } from "./data";
import type { Product } from "./schemas";

export const USER_COOKIE = "cosmos_user";

export type Persona = {
  id: "ananya";
  firstName: string;
  phoneMasked: string;
  emailMasked: string;
  address: { label: string; line1: string; city: string; pincode: string };
  paymentMethods: string[];
  walletInr: number;
  rtoRisk: "low" | "medium" | "high"; // internal: drives the pay-online nudge, never shown to her
  ownedSkus: string[];
  maxEarringMm: number; // from her size preference (small to medium)
};

export function personaFromDb(): Persona {
  const p = getDb().shoppers.tier3_demo;
  const home = p.saved_addresses.find((a) => a.default) ?? p.saved_addresses[0];
  return {
    id: "ananya",
    firstName: p.name,
    phoneMasked: p.phone_masked,
    emailMasked: p.email_masked,
    address: { label: home.label, line1: home.line1_masked, city: home.city, pincode: home.pincode },
    paymentMethods: p.saved_payment_methods.map((m) => m.display),
    walletInr: p.loyalty_wallet_inr,
    rtoRisk: p.rto_risk,
    ownedSkus: p.brand_order_history.filter((o) => o.status === "kept").map((o) => o.sku),
    maxEarringMm: 30,
  };
}

export async function getUser(): Promise<Persona | null> {
  const jar = await cookies();
  return jar.get(USER_COOKIE)?.value === "ananya" ? personaFromDb() : null;
}

/** For route handlers: read the same cookie from the raw request. */
export function userFromRequest(req: Request): Persona | null {
  const c = req.headers.get("cookie") ?? "";
  return /(?:^|;\s*)cosmos_user=ananya(?:;|$)/.test(c) ? personaFromDb() : null;
}

/**
 * Personalised rail: drop what she already owns, favour small/medium earrings (her size preference), and add one
 * chain that goes with the pendant she bought. Deterministic, computed in code from her order history.
 */
export function personaliseRail(base: string[], candidates: string[], hero: string, persona: Persona, size: number): string[] {
  const db = getDb();
  const P = (h: string) => db.products.find((p) => p.handle === h) as Product | undefined;
  const excluded = new Set(db.rules.excluded_skus.map((e) => e.sku));
  const ok = (h: string) => !!P(h) && h !== hero && !persona.ownedSkus.includes(h) && !excluded.has(h) && !P(h)!.metafields.jewellery.excluded;
  const fitsHer = (h: string) => {
    const j = P(h)!.metafields.jewellery;
    return j.category !== "earrings" || (j.outer_diameter_mm ?? j.drop_length_mm ?? 0) <= persona.maxEarringMm;
  };
  const out: string[] = base.filter((h) => ok(h) && fitsHer(h));
  // goes with her pendant: one chain she doesn't own
  const ownsPendant = persona.ownedSkus.some((h) => P(h)?.metafields.jewellery.subtype === "pendant");
  if (ownsPendant && !out.some((h) => P(h)?.metafields.jewellery.subtype === "chain")) {
    const chain = db.products.find((p) => p.metafields.jewellery.subtype === "chain" && ok(p.handle));
    if (chain) out.splice(Math.min(1, out.length), 0, chain.handle);
  }
  for (const h of candidates) if (out.length < size && ok(h) && fitsHer(h) && !out.includes(h)) out.push(h);
  return out.slice(0, size);
}
