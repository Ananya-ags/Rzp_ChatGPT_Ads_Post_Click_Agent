import PhoneFrame from "@/components/PhoneFrame";
import CheckoutFlow from "@/components/checkout/CheckoutFlow";
import { getDb, resolveAdGroup } from "@/lib/data";
import { getUser } from "@/lib/user";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export const metadata = { title: "Checkout · Cosmos" };

/** Checkout (no Cosmos AI here): simulated Magic Checkout-style steps, then Razorpay Standard Checkout (Test Mode). */
export default async function Page({ searchParams }: Props) {
  const sp = await searchParams;
  const db = getDb();
  const group = resolveAdGroup({ ad_group: one(sp.ad_group) });
  const armParam = one(sp.arm)?.toUpperCase();
  const arm = armParam === "A" || armParam === "B" ? armParam : "C";
  const user = await getUser();
  const linkQuery = group ? `?ad_group=${group.id}${armParam ? `&arm=${arm}` : ""}` : armParam ? `?arm=${arm}` : "";
  return (
    <PhoneFrame label="Shopper view · checkout (steps simulated · payment in Razorpay Test Mode)">
      <CheckoutFlow
        loggedIn={user ? { phone: db.shoppers.tier3_demo.demo_login_phone, prefill: { name: user.firstName, email_masked: user.emailMasked, phone_masked: user.phoneMasked, address: user.address, wallet_inr: user.walletInr } } : null}
        adGroupId={group?.id ?? null}
        arm={arm}
        giftWrap={one(sp.gift) === "1"}
        backHref={`/cart${linkQuery}`}
        badges={{ buyer: "Buyer Protection (simulated)", trusted: "Trusted Business (simulated)" }}
      />
    </PhoneFrame>
  );
}
