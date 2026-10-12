import { useId } from "react";

/**
 * The four-point star from the Cosmos logo (the one inside the "O"), as an SVG: brushed-gold gradient in the
 * logo's colours, a thin gold-deep edge and an optional gentle glint. Motion stops under prefers-reduced-motion.
 */
const STAR = "M12 1.5C12.55 8.3 15.7 11.45 22.5 12C15.7 12.55 12.55 15.7 12 22.5C11.45 15.7 8.3 12.55 1.5 12C8.3 11.45 11.45 8.3 12 1.5Z";

export default function CosmosStar({ className = "size-4", shimmer = true, title }: { className?: string; shimmer?: boolean; title?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 24 24" className={`${shimmer ? "cosmos-star" : ""} ${className}`} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={`${id}-gold`} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f6e2b0" />
          <stop offset="0.4" stopColor="#e2bc6e" />
          <stop offset="0.7" stopColor="#b8893b" />
          <stop offset="1" stopColor="#8c6524" />
        </linearGradient>
        <linearGradient id={`${id}-glint`} x1="6" y1="4" x2="14" y2="14" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fffaf0" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fffaf0" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={STAR} fill={`url(#${id}-gold)`} stroke="#8c6524" strokeOpacity="0.55" strokeWidth="0.6" strokeLinejoin="round" />
      {shimmer && <path d={STAR} fill={`url(#${id}-glint)`} className="cosmos-star-glint" />}
    </svg>
  );
}

/** The star set in a small ivory disc, so it reads on the gold "Ask Cosmos AI" buttons. */
export function CosmosStarBadge({ className = "size-6" }: { className?: string }) {
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full bg-[#fffaf0]/90 shadow-[inset_0_1px_2px_rgba(140,101,36,0.25)] ${className}`}>
      <CosmosStar className="size-[70%]" />
    </span>
  );
}
