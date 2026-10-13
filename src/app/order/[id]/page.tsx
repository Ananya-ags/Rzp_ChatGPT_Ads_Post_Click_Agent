import PhoneFrame from "@/components/PhoneFrame";
import OrderConfirmation from "@/components/checkout/OrderConfirmation";
import { getDb } from "@/lib/data";

type Props = { params: Promise<{ id: string }> };
export const metadata = { title: "Order confirmed · Cosmos" };

/** Order confirmation (no Cosmos AI here). The order itself is read from this browser session. */
export default async function Page({ params }: Props) {
  const { id } = await params;
  const s = getDb().brand.support;
  return (
    <PhoneFrame label="Shopper view · order confirmation">
      <OrderConfirmation id={decodeURIComponent(id)} support={{ email: s.email, reply: s.reply }} />
    </PhoneFrame>
  );
}
