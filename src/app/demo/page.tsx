import DemoConsole from "@/components/console/DemoConsole";
import { getDb } from "@/lib/data";
import proposalsJson from "../../../data/generated/proposals.json";
import { ProposalsSchema } from "@/lib/schemas";

export const metadata = { title: "Under the hood · Cosmos AI agent" };

const EVALS_URL = "https://github.com/Ananya-ags/Rzp_build_cosmos/blob/main/docs/EVALS.md";

/**
 * Guided demo with the under-the-hood view (desktop only): the real site in a phone-frame iframe on the left, the
 * AI console on the right. Outside the shop: no shop components; the console only listens to the site's events.
 */
export default function Page() {
  const db = getDb();
  const proposals = ProposalsSchema.parse(proposalsJson).proposals.filter((p) => p.type === "new_ad_group");
  const merchant = proposals.map((p) => {
    const group = db.adGroups.find((g) => g.origin_proposal === p.id);
    const rail = group ? db.rails.rails[group.id] : null;
    const conv = group ? db.mock.conversations.find((c) => c.ad_group === group.id) : null;
    return {
      id: p.id,
      title: p.title,
      evidence: p.evidence.slice(0, 3).map((e) => `${e.label}: ${e.value}`),
      group: group ? { id: group.id, name: group.name, ad_group_id: group.ad_group_id, ad_id: group.ad_id, campaign_id: group.campaign_id, budget: group.daily_budget_inr } : null,
      rail: rail ? { count: rail.items.length, first: rail.items.slice(0, 3).map((i) => `${db.products.find((x) => x.handle === i.sku)?.title ?? i.sku}: ${i.reason}`), producer: `${db.rails.producer.mode} · ${db.rails.producer.model ?? ""} · ${db.rails.producer.prompt_version}` } : null,
      conversation: conv?.title ?? null,
    };
  });
  return <DemoConsole merchant={merchant} evalsUrl={EVALS_URL} />;
}
