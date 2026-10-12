import { notFound } from "next/navigation";
import PhoneFrame from "@/components/PhoneFrame";
import StorePage from "@/components/shop/StorePage";
import { SIMULATED_NOTE, storeData } from "@/lib/store";

type Props = { params: Promise<{ category: string }> };

export const dynamicParams = false;
export function generateStaticParams() {
  return storeData().categories.map((c) => ({ category: c.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { category } = await params;
  const c = storeData().categories.find((x) => x.slug === category);
  return { title: c ? `${c.label} · Cosmos` : "Cosmos" };
}

/** Category page: only that category's SKUs, same static 2-column grid as the store home. */
export default async function Page({ params }: Props) {
  const { category } = await params;
  const { categories, cards, sections, shippingNote } = storeData();
  const section = sections.find((s) => s.slug === category);
  if (!section) notFound();
  return (
    <PhoneFrame label={`Shopper view · category: ${section.label} (static)`}>
      <StorePage
        key={category}
        title={section.label}
        intro={`${section.cards.length} pieces · ${shippingNote}`}
        sections={[section]}
        showSectionHeads={false}
        categories={categories.map(({ slug, label }) => ({ slug, label }))}
        activeSlug={category}
        cards={cards}
        simulatedNote={SIMULATED_NOTE}
        path={`/c/${category}`}
      />
    </PhoneFrame>
  );
}
