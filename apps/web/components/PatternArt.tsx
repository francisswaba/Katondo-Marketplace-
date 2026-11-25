import { useId } from 'react';
import type { ProductType } from '@katondo/contracts';

/**
 * Chitenge-inspired artwork, one motif per product type.
 * Used wherever a listing has no photo yet, so feeds still feel designed.
 */
const palette: Record<ProductType, { bg: string; fg: string }> = {
  fashion: { bg: '#1F5D7A', fg: '#9FD3E6' },
  electronics: { bg: '#0A3D2E', fg: '#3BD18F' },
  vehicles: { bg: '#1C2420', fg: '#BFCBC4' },
  property: { bg: '#0E7C57', fg: '#BFEBD7' },
  home: { bg: '#9A5A2C', fg: '#F0CFAF' },
  food: { bg: '#D9A821', fg: '#5C3F05' },
  agriculture: { bg: '#5E7A31', fg: '#E1EBC2' },
  handmade: { bg: '#6E3326', fg: '#E8A97F' },
  services: { bg: '#36437F', fg: '#C7CEF4' },
  general: { bg: '#2B3832', fg: '#A7B7AE' },
};

function Motif({ type, fg }: { type: ProductType; fg: string }) {
  switch (type) {
    case 'fashion':
      return <path d="M20 0 40 20 20 40 0 20Z" fill="none" stroke={fg} strokeWidth="3" />;
    case 'electronics':
      return <><circle cx="10" cy="10" r="3" fill={fg} /><circle cx="30" cy="30" r="3" fill={fg} /><path d="M10 10h20v20" fill="none" stroke={fg} strokeWidth="1.5" opacity=".5" /></>;
    case 'vehicles':
      return <path d="M0 14 20 26 40 14M0 34 20 46 40 34" fill="none" stroke={fg} strokeWidth="4" />;
    case 'property':
      return <path d="M4 40V22a16 16 0 0 1 32 0v18M12 40V24a8 8 0 0 1 16 0v16" fill="none" stroke={fg} strokeWidth="3" />;
    case 'home':
      return <><rect x="0" y="0" width="20" height="8" fill={fg} /><rect x="20" y="20" width="20" height="8" fill={fg} /><rect x="0" y="14" width="40" height="2" fill={fg} opacity=".5" /></>;
    case 'food':
      return <><circle cx="10" cy="10" r="6" fill={fg} /><circle cx="30" cy="30" r="6" fill={fg} /><circle cx="30" cy="10" r="2.5" fill={fg} /><circle cx="10" cy="30" r="2.5" fill={fg} /></>;
    case 'agriculture':
      return <path d="M0 10 10 2 20 10 30 2 40 10M0 30 10 22 20 30 30 22 40 30" fill="none" stroke={fg} strokeWidth="3" />;
    case 'handmade':
      return <><circle cx="20" cy="20" r="16" fill="none" stroke={fg} strokeWidth="3" /><circle cx="20" cy="20" r="8" fill="none" stroke={fg} strokeWidth="3" /><circle cx="20" cy="20" r="2" fill={fg} /></>;
    case 'services':
      return <path d="M20 8v24M8 20h24" stroke={fg} strokeWidth="4" />;
    default:
      return <path d="M0 40 20 6 40 40Z" fill="none" stroke={fg} strokeWidth="3" />;
  }
}

export default function PatternArt({ type, imageUrl, label }: { type: ProductType; imageUrl?: string; label: string }) {
  // Each instance gets its own pattern id: a shared id breaks when its first copy is hidden.
  const id = `motif-${type}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="art-image" src={imageUrl} alt={label} loading="lazy" />;
  }
  const { bg, fg } = palette[type] ?? palette.general;
  return (
    <svg className="art-pattern" role="img" aria-label={label} preserveAspectRatio="xMidYMid slice" viewBox="0 0 400 400">
      <defs>
        <pattern id={id} width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(-8) scale(1.4)">
          <Motif type={type} fg={fg} />
        </pattern>
      </defs>
      <rect width="400" height="400" fill={bg} />
      <rect width="400" height="400" fill={`url(#${id})`} opacity=".55" />
    </svg>
  );
}

export function typeColour(type: ProductType) {
  return (palette[type] ?? palette.general).bg;
}
