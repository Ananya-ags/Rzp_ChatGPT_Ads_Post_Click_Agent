import MerchantConsole, { type MerchantProps } from "@/components/merchant/MerchantConsole";
import { getDb } from "@/lib/data";
import { slice, isChatgpt } from "@/lib/metrics";
import { OrdersSessionsSchema, ProposalsSchema } from "@/lib/schemas";
import { abuseCheck } from "@/lib/agent/abuse";
import { inputCheck } from "@/lib/agent/guardrails";
import { PROPOSAL } from "@/lib/overrides";
import ordersJson from "../../../data/orders_sessions.json";
import proposalsJson from "../../../data/generated/proposals.json";
import clustersJson from "../../../data/generated/intent_clusters.json";

export const metadata = { title: "Merchant console · Cosmos" };

/** Shopper messages shown to the merchant: never abusive text or injection attempts. */
const safe = (t: string) => !abuseCheck(t).hit && !inputCheck(t).injection;

/**
 * Merchant console (standalone, desktop-first). Every number is computed here in code from the simulated
 * orders_sessions.json; proposals come from the offline pipeline (data/generated/proposals.json).
 */
export default function Page() {
  const db = getDb();
  const os = OrdersSessionsSchema.parse(ordersJson);
  const ad = os.sessions.filter(isChatgpt);
  const ids = new Set(ad.map((s) => s.session_id));
  const orders = os.orders.filter((o) => ids.has(o.session_id));
  const s = slice(os, isChatgpt);
  const paid = orders.reduce((n, o) => n + o.amount, 0);

  const file = ProposalsSchema.parse(proposalsJson);
  const name = (sku: string) => db.products.find((p) => p.handle === sku)?.title ?? sku;
  const steelRail = db.rails.rails["stainless-steel-earrings"]?.items.length ?? 0;
  const RESULT: Record<string, string> = {
    [PROPOSAL.steelAd]: `Ad live in ChatGPT · rail of ${steelRail} steel earrings`,
    [PROPOSAL.waterproof]: "Water-resistant badge on 18 products · Cosmos AI may now state it",
    [PROPOSAL.layeredOffice]: `${name("sol-layered-chain-set")} excluded from Office minimal · ${name("sol-snake-chain")} suggested instead`,
    [PROPOSAL.pauseWedding]: "Cosmos AI paused on Wedding guest & gifting pages · the curated rail stays",
  };

  const clusters = (clustersJson as { clusters: { id: string; label: string; count: number; sample_wordings: string[] }[] }).clusters;

  const props: MerchantProps = {
    period: os.period,
    funnel: [
      { label: "Ad clicks", n: ad.length },
      { label: "Chats started", n: ad.filter((x) => x.chat_opened).length },
      { label: "Added to bag", n: ad.filter((x) => x.added_to_bag).length },
      { label: "Orders", n: s.orders },
    ],
    conversion: s.conversion,
    kept: { paid, kept: Math.round(s.kept), lost: Math.round(paid - s.kept), predictedShare: s.predictedShare },
    proposals: file.proposals.map((p) => ({
      id: p.id,
      title: p.title,
      summary: p.summary,
      confidence: p.confidence,
      evidence: p.evidence.map((e) => ({ label: e.label, value: e.value })).filter((e) => !/example phrases/i.test(e.label)),
      examples: p.examples.filter(safe).slice(0, 4),
      result: RESULT[p.id] ?? "Applied",
    })),
    producer: `${file.producer.model ?? file.producer.mode} · ${file.producer.prompt_version}`,
    clusters: clusters
      .map((c) => ({ id: c.id, label: c.label, count: c.count, examples: c.sample_wordings.filter(safe).slice(0, 2) }))
      .filter((c) => c.examples.length > 0)
      .sort((a, b) => b.count - a.count),
    adGroupNames: Object.fromEntries(db.adGroups.map((g) => [g.id, g.name])),
  };
  return <MerchantConsole {...props} />;
}
