/** App-side data access (server components and route handlers). Static JSON imports, validated once. */
import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { z } from "zod";
import * as S from "../schemas";
import type { Db, ReturnsClassified } from "../tools/core";
import { demoNow } from "../../config/demo";

import brandJson from "../../../data/brand.json";
import productsJson from "../../../data/catalogue/products.json";
import adGroupsJson from "../../../data/ad_groups.json";
import rulesJson from "../../../data/brand_rules.json";
import offersJson from "../../../data/offers.json";
import logisticsJson from "../../../data/logistics.json";
import returnsJson from "../../../data/returns.json";
import shoppersJson from "../../../data/shoppers.json";
import mockJson from "../../../data/mock_chatgpt.json";
import demoJson from "../../../data/demo_script.json";
import manifestJson from "../../../data/images/manifest.json";
import railsJson from "../../../data/generated/rails.json";
import openersJson from "../../../data/generated/openers.json";
import enrichedJson from "../../../data/generated/enriched_catalogue.json";
import returnsClsJson from "../../../data/generated/returns_classified.json";
import razorpayJson from "../../../data/razorpay.json";
import policiesJson from "../../../data/policies.json";
import proposalsJson from "../../../data/generated/proposals.json";
import { PROPOSAL } from "../overrides";

type FullDb = Db & { razorpay: z.infer<typeof S.RazorpayConfigSchema>; mock: z.infer<typeof S.MockChatgptSchema>; demo: S.DemoScript; manifest: S.Manifest; rails: S.Rails; openers: S.Openers; enriched: S.Enriched };
let cached: (Db & { razorpay: z.infer<typeof S.RazorpayConfigSchema>; mock: z.infer<typeof S.MockChatgptSchema>; demo: S.DemoScript; manifest: S.Manifest; rails: S.Rails; openers: S.Openers; enriched: S.Enriched }) | null = null;

/** Merchant approvals for this request (set by the chat route); getDb() returns the matching variant. */
const approvals = new AsyncLocalStorage<string[]>();
export const runWithApprovals = <T,>(approved: string[], fn: () => T) => approvals.run(approved, fn);

export function getDb(): FullDb {
  const approved = approvals.getStore();
  return approved?.length ? getDbFor(approved) : baseDb();
}

const variants = new Map<string, FullDb>();
/**
 * The catalogue with the merchant's approvals applied (code, never the model):
 * - waterproof feed attribute → water_resistant: true on the proposal's SKUs (badge, facts, agent claims)
 * - brand rule → the SKU leaves that ad group's candidates and rail
 */
export function getDbFor(approved: string[]): FullDb {
  const base = baseDb();
  const ids = [PROPOSAL.waterproof, PROPOSAL.layeredOffice].filter((id) => approved.includes(id));
  if (!ids.length) return base;
  const key = ids.join(",");
  const hit = variants.get(key);
  if (hit) return hit;
  const proposals = S.ProposalsSchema.parse(proposalsJson).proposals;
  let db: FullDb = base;
  for (const id of ids) {
    const a = proposals.find((p) => p.id === id)?.apply as Record<string, unknown> | undefined;
    if (!a) continue;
    if (a.action === "set_feed_attribute" && a.attribute === "water_resistant" && Array.isArray(a.skus)) {
      const skus = new Set(a.skus as string[]);
      db = { ...db, products: db.products.map((p) => (skus.has(p.handle) ? { ...p, metafields: { ...p.metafields, jewellery: { ...p.metafields.jewellery, water_resistant: true } } } : p)) };
    }
    if (a.action === "add_brand_rule_exclusion" && typeof a.ad_group_id === "string" && typeof a.sku === "string") {
      const g = a.ad_group_id, sku = a.sku;
      const rail = db.rails.rails[g];
      db = {
        ...db,
        adGroups: db.adGroups.map((x) => (x.id === g ? { ...x, candidate_skus: x.candidate_skus.filter((s) => s !== sku) } : x)),
        rails: rail ? { ...db.rails, rails: { ...db.rails.rails, [g]: { ...rail, items: rail.items.filter((it) => it.sku !== sku) } } } : db.rails,
      };
    }
  }
  variants.set(key, db);
  return db;
}

function baseDb(): FullDb {
  if (cached) return cached;
  cached = {
    brand: S.BrandSchema.parse(brandJson),
    products: S.ProductsFileSchema.parse(productsJson).products,
    adGroups: S.AdGroupsFileSchema.parse(adGroupsJson).ad_groups,
    rules: S.BrandRulesSchema.parse(rulesJson),
    offers: S.OffersFileSchema.parse(offersJson).offers,
    logistics: S.LogisticsSchema.parse(logisticsJson),
    returns: S.ReturnsFileSchema.parse(returnsJson).skus,
    shoppers: S.ShoppersSchema.parse(shoppersJson),
    returnsClassified: returnsClsJson as unknown as ReturnsClassified,
    now: demoNow(),
    razorpay: S.RazorpayConfigSchema.parse(razorpayJson),
    mock: S.MockChatgptSchema.parse(mockJson),
    demo: S.DemoScriptSchema.parse(demoJson),
    manifest: S.ManifestSchema.parse(manifestJson),
    rails: S.RailsSchema.parse(railsJson),
    openers: S.OpenersSchema.parse(openersJson),
    enriched: S.EnrichedSchema.parse(enrichedJson),
    policies: S.PoliciesFileSchema.parse(policiesJson).policies,
  };
  return cached;
}

/** Resolve the ad context from URL params: OpenAI's opaque ad_group_id, or our readable slug. */
export function resolveAdGroup(params: { ad_group_id?: string; ad_group?: string }) {
  const db = getDb();
  return db.adGroups.find((g) => (params.ad_group_id && g.ad_group_id === params.ad_group_id) || (params.ad_group && g.id === params.ad_group)) ?? null;
}
