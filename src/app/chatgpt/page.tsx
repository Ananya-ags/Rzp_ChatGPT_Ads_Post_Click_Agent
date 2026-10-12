import PhoneFrame from "@/components/PhoneFrame";
import MockChatgpt from "@/components/chatgpt/MockChatgpt";
import { getDb } from "@/lib/data";
import { toCard } from "@/lib/view";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Page({ searchParams }: Props) {
  const sp = await searchParams;
  const db = getDb();
  const conversations = db.mock.conversations.map((c) => {
    const g = db.adGroups.find((x) => x.id === c.ad_group)!;
    const hero = db.products.find((p) => p.handle === g.hero_sku)!;
    return {
      id: c.id,
      title: c.title,
      requires_approval_of: c.requires_approval_of,
      proposalId: g.origin_proposal,
      turns: c.turns,
      card: { advertiser: c.sponsored_card.advertiser, title: c.sponsored_card.title, body: c.sponsored_card.body, cta: c.sponsored_card.cta, click_url: c.sponsored_card.click_url, hero: toCard(hero, db.manifest) },
    };
  });
  const initial = typeof sp.c === "string" ? sp.c : conversations[0].id;
  return (
    <PhoneFrame chrome={{ kind: "status" }} label="Mock ChatGPT (simulated) · tap a sponsored card">
      <MockChatgpt conversations={conversations} initial={initial} />
    </PhoneFrame>
  );
}
