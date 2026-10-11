/** Icon row under the description. Only facts verified for this product are passed in (claims policy). */
export type Badge = { icon: "shield" | "gold" | "truck"; label: string; sub: string };

const ICONS: Record<Badge["icon"], React.ReactNode> = {
  // anti-tarnish: shield with a check
  shield: (
    <>
      <path d="M12 3l7 3v5c0 4.4-3 8.3-7 10-4-1.7-7-5.6-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  // gold plating: stacked gold bars with a sparkle (original drawing)
  gold: (
    <>
      <path d="M3 20l1.6-4.5h6.8L13 20z" />
      <path d="M11 20l1.6-4.5h6.8L21 20z" />
      <path d="M7 15.5l1.6-4.5h6.8l1.6 4.5" />
      <path d="M18.5 4.5v3M17 6h3" />
      <path d="M6 6.5v2M5 7.5h2" />
    </>
  ),
  // free shipping: delivery van
  truck: (
    <>
      <path d="M2 6h11v10H2zM13 9h4l3 3v4h-7" />
      <circle cx="6.5" cy="17.5" r="1.7" />
      <circle cx="16.5" cy="17.5" r="1.7" />
    </>
  ),
};

export default function TrustBadges({ badges }: { badges: Badge[] }) {
  if (!badges.length) return null;
  return (
    <section className="mx-4 mt-6 grid gap-2" style={{ gridTemplateColumns: `repeat(${badges.length}, minmax(0, 1fr))` }} aria-label="Product promises">
      {badges.map((b) => (
        <div key={b.icon} className="flex flex-col items-center gap-1.5 text-center">
          <span className="grid size-11 place-items-center rounded-full border border-gold/40 bg-gold/10 text-gold-deep">
            <svg viewBox="0 0 24 24" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {ICONS[b.icon]}
            </svg>
          </span>
          <span className="text-[11.5px] font-medium leading-tight">{b.label}</span>
          <span className="text-[10.5px] leading-tight text-muted">{b.sub}</span>
        </div>
      ))}
    </section>
  );
}
