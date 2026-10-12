/**
 * Placeholder product art drawn from verified data when a SKU has no photo.
 * Hoops are drawn at their true relative diameter, so a 4cm and a 3cm look different. Sizes are in cm.
 */
type Props = { subtype: string; outer?: number | null; drop?: number | null; stone?: string; finish?: string; className?: string; label?: string };

const GOLD = (
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#f3d79a" />
      <stop offset="0.45" stopColor="#c99a45" />
      <stop offset="0.7" stopColor="#e9c77f" />
      <stop offset="1" stopColor="#9c7230" />
    </linearGradient>
    <radialGradient id="bg" cx="0.5" cy="0.4" r="0.8">
      <stop offset="0" stopColor="#fbf7f2" />
      <stop offset="1" stopColor="#efe4d6" />
    </radialGradient>
  </defs>
);

export default function ProductArt({ subtype, outer, drop, stone, finish, className, label }: Props) {
  const s = 200;
  const pearl = stone === "pearl";
  const sparkle = stone === "CZ / American diamond";
  const kundan = stone === "kundan";
  const sw = finish === "hammered" ? 7 : 6;
  let body: React.ReactNode;
  switch (subtype) {
    case "hoop":
    case "huggie": {
      const r = Math.max(14, Math.min(70, ((outer ?? 2) / 4) * 62));
      body = (
        <g>
          <circle cx={78} cy={100} r={r} fill="none" stroke="url(#g)" strokeWidth={subtype === "huggie" ? 9 : sw} />
          <circle cx={130} cy={108} r={r} fill="none" stroke="url(#g)" strokeWidth={subtype === "huggie" ? 9 : sw} opacity={0.9} />
        </g>
      );
      break;
    }
    case "stud":
      body = (
        <g>
          {[70, 130].map((x) => (
            <g key={x}>
              <circle cx={x} cy={100} r={pearl ? 16 : 13} fill={pearl ? "#f7f1e8" : sparkle ? "#ffffff" : "url(#g)"} stroke="url(#g)" strokeWidth={pearl ? 2 : 4} />
              {sparkle && <path d={`M${x - 7} ${100}L${x} ${93}L${x + 7} ${100}L${x} ${107}Z`} fill="#dfe7ee" />}
            </g>
          ))}
        </g>
      );
      break;
    case "drop":
    case "jhumka": {
      const len = Math.max(40, Math.min(110, (drop ?? 3.5) * 16));
      body = (
        <g>
          {[72, 128].map((x) => (
            <g key={x}>
              <circle cx={x} cy={48} r={5} fill="url(#g)" />
              <line x1={x} y1={52} x2={x} y2={48 + len * 0.45} stroke="url(#g)" strokeWidth={3} />
              {subtype === "jhumka" ? (
                <g>
                  <path d={`M${x - 20} ${48 + len}Q${x} ${48 + len * 0.3} ${x + 20} ${48 + len}Z`} fill="url(#g)" />
                  {[...Array(5)].map((_, i) => (
                    <circle key={i} cx={x - 16 + i * 8} cy={52 + len} r={3} fill={kundan ? "#c0392b" : "#f7f1e8"} stroke="#c99a45" strokeWidth={0.8} />
                  ))}
                </g>
              ) : pearl ? (
                <circle cx={x} cy={48 + len * 0.6} r={12} fill="#f7f1e8" stroke="#d9c9b0" />
              ) : (
                <path d={`M${x} ${48 + len * 0.4}Q${x + 14} ${48 + len * 0.75} ${x} ${48 + len}Q${x - 14} ${48 + len * 0.75} ${x} ${48 + len * 0.4}Z`} fill="url(#g)" />
              )}
            </g>
          ))}
        </g>
      );
      break;
    }
    case "chain":
    case "pendant":
    case "layered set":
    case "choker": {
      const rows = subtype === "layered set" ? [70, 92, 114] : [subtype === "choker" ? 70 : 92];
      body = (
        <g>
          {rows.map((y, i) => (
            <path key={i} d={`M30 40Q100 ${y + 60} 170 40`} fill="none" stroke={subtype === "choker" ? "#efe6da" : "url(#g)"} strokeWidth={subtype === "choker" ? 9 : 3} strokeDasharray={subtype === "chain" || subtype === "layered set" ? "7 3" : undefined} />
          ))}
          {subtype === "pendant" && <circle cx={100} cy={128} r={14} fill="url(#g)" />}
        </g>
      );
      break;
    }
    case "band":
      body = (
        <g>
          <ellipse cx={100} cy={104} rx={46} ry={40} fill="none" stroke="url(#g)" strokeWidth={10} />
          {sparkle && <circle cx={100} cy={62} r={10} fill="#fff" stroke="url(#g)" strokeWidth={3} />}
        </g>
      );
      break;
    default:
      body = <path d="M38 118Q100 30 162 118" fill="none" stroke="url(#g)" strokeWidth={subtype === "cuff" ? 16 : 4} strokeLinecap="round" strokeDasharray={subtype === "bracelet" ? "6 3" : undefined} />;
  }
  return (
    <svg viewBox={`0 0 ${s} ${s}`} className={className} role="img" aria-label={label ?? "Product illustration"}>
      {GOLD}
      <rect width={s} height={s} fill="url(#bg)" />
      {body}
    </svg>
  );
}
