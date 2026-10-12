import PhoneFrame from "@/components/PhoneFrame";
import LoginForm from "@/components/shop/LoginForm";
import { getDb, resolveAdGroup } from "@/lib/data";
import { getUser } from "@/lib/user";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export const metadata = { title: "Log in · Cosmos" };

export default async function Page({ searchParams }: Props) {
  const sp = await searchParams;
  const db = getDb();
  const raw = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : "/p/ciel-hoops-40mm";
  // keep the in-app browser look when the shopper came from a sponsored card
  const q = new URLSearchParams(raw.split("?")[1] ?? "");
  const group = resolveAdGroup({ ad_group: q.get("ad_group") ?? undefined });
  const via = q.get("via") === "chatgpt" && !!group;
  const backConv = group ? db.mock.conversations.find((c) => c.ad_group === group.id)?.id : undefined;
  const user = await getUser();
  const p = db.shoppers.tier3_demo;
  return (
    <PhoneFrame chrome={via ? { kind: "webview", backHref: `/chatgpt${backConv ? `?c=${backConv}` : ""}`, domain: "cosmos.example" } : undefined} label="Shopper view · log in (simulated)">
      <LoginForm next={raw} loggedInAs={user?.firstName ?? null} demo={{ phone: p.demo_login_phone, otp: p.otp_for_demo, firstName: p.name }} />
    </PhoneFrame>
  );
}
