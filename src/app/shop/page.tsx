import PhoneFrame from "@/components/PhoneFrame";
import StorePage from "@/components/shop/StorePage";
import { SIMULATED_NOTE, storeData } from "@/lib/store";

export const metadata = { title: "Shop all · Cosmos" };

/** Store home: static by design (same grid for every visitor); Cosmos AI lives on product pages and in chat. */
export default function Page() {
  const { categories, cards, sections, shippingNote } = storeData();
  return (
    <PhoneFrame label="Shopper view · store home (static, same for every visitor)">
      <StorePage
        title="Shop all"
        intro={`Anti-tarnish demi-fine jewellery · ${shippingNote}`}
        sections={sections}
        showSectionHeads
        categories={categories.map(({ slug, label }) => ({ slug, label }))}
        activeSlug={null}
        cards={cards}
        simulatedNote={SIMULATED_NOTE}
        path="/shop"
      />
    </PhoneFrame>
  );
}
