/**
 * The Katondo "Live" mark: a rounded K with the orange live dot.
 * The K takes the current text colour (so it follows light and dark mode);
 * the dot is always live orange.
 *
 * `live` makes a ring pulse out from the dot. Use it only in live moments
 * (loading, an auction running), so the motion always means something.
 */
export default function BrandMark({ size = 24, className = 'brand-mark', live = false }: { size?: number; className?: string; live?: boolean }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true" overflow="visible">
      <rect x="20" y="18" width="24" height="92" rx="12" fill="currentColor" />
      <line x1="60" y1="68" x2="98" y2="98" stroke="currentColor" strokeWidth="24" strokeLinecap="round" />
      <line x1="58" y1="62" x2="80" y2="38" stroke="currentColor" strokeWidth="24" strokeLinecap="round" />
      {live && <circle className="live-pulse" cx="98" cy="20" r="12" fill="none" stroke="#f2631c" strokeWidth="5" />}
      <circle cx="98" cy="20" r="12" fill="#f2631c" />
    </svg>
  );
}
