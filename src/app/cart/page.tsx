import PhoneFrame from "@/components/PhoneFrame";
import CartView from "@/components/shop/CartView";
import { getDb, resolveAdGroup } from "@/lib/data";
import { toCard } from "@/lib/view";
import { getUser } from "@/lib/user";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export const metadata = { title: "Your bag · Cosmos" };

export default async function Page({ searchParams }: Props) {
  const sp = await searchParams;
  const db = getDb();
  const group = resolveAdGroup({ ad_group: one(sp.ad_group) });
  const via = one(sp.via) === "chatgpt" && !!group;
  const arm = one(sp.arm);
  const linkQuery = group ? `?ad_group=${group.id}${arm ? `&arm=${arm}` : ""}${via ? "&via=chatgpt" : ""}` : "";
  const backConv = group ? db.mock.conversations.find((c) => c.ad_group === group.id)?.id : undefined;
  const cards = Object.fromEntries(db.products.map((p) => [p.handle, toCard(p, db.manifest)]));
  const m = db.razorpay.magic_checkout_simulated;
  const user = await getUser();
  return (
    <PhoneFrame
      chrome={via ? { kind: "webview", backHref: `/chatgpt${backConv ? `?c=${backConv}` : ""}`, domain: "cosmos.example" } : undefined}
      label="Shopper view · bag"
    >
      <CartView cards={cards} linkQuery={linkQuery} continueHref={group ? `/p/${group.hero_sku}${linkQuery}` : "/"} trust={[m.buyer_protection_badge, m.trusted_business_badge]} user={user ? { firstName: user.firstName } : null} loginHref={`/login?next=${encodeURIComponent(`/cart${linkQuery}`)}`} />
    </PhoneFrame>
  );
}
