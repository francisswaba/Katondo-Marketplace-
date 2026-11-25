import type { CatalogueResponse, ListingResponse, StorefrontResponse } from '@katondo/contracts';

export const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${apiUrl}${path}`, { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function getCatalogue(productType?: string) {
  const query = productType ? `?type=${encodeURIComponent(productType)}` : '';
  return getJson<CatalogueResponse>(`/api/catalogue${query}`);
}

export function getListing(listingId: string) {
  return getJson<ListingResponse>(`/api/listings/${encodeURIComponent(listingId)}`);
}

export function getStorefront(sellerId: string) {
  return getJson<StorefrontResponse>(`/api/shops/${encodeURIComponent(sellerId)}`);
}
