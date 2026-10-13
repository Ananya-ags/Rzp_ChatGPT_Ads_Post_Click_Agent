/**
 * AI console "Simulate a slip" (demo only): runs the real G12 claim checker on a canned unsafe draft for a product,
 * to show what a caught claim looks like. Nothing is sent to a shopper; the console labels it "simulated".
 */
import { getDb } from "@/lib/data";
import { regulatedClaims } from "@/lib/agent/guardrails";
import * as core from "@/lib/tools/core";

export async function POST(req: Request) {
  const { sku = "tara-solitaire-studs" }: { sku?: string } = await req.json().catch(() => ({}));
  const db = getDb();
  const page = core.findProduct(db, sku) ?? core.findProduct(db, "tara-solitaire-studs")!;
  const draft = `Yes, the ${page.title} are hypoallergenic, so they're perfect for sensitive ears.`;
  const sources = JSON.stringify(core.verifiedFacts(page));
  const caught = regulatedClaims(draft, sources, page);
  const safe = `${core.nickelAnswer(page)} ${core.careReach(db)}`;
  return Response.json({ product: page.title, draft, caught, safe_reply: safe });
}
