import type { CatalogueResponse, FeatureFlags, ListingResponse, ShopReviewsResponse, StorefrontResponse } from '@katondo/contracts';

export const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

/**
 * Catalogue data is cached for a minute and refreshed in the background, so pages
 * can be served straight from the CDN instead of waiting on the API every visit.
 * New listings appear within about a minute.
 */
export const catalogueRevalidateSeconds = 60;

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${apiUrl}${path}`, { next: { revalidate: catalogueRevalidateSeconds } });
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

export function getShopReviews(sellerId: string) {
  return getJson<ShopReviewsResponse>(`/api/shops/${encodeURIComponent(sellerId)}/reviews`);
}

/** Optional features (reviews, messaging) switched on in the API. Off if the API can't be reached. */
export async function getFeatures(): Promise<FeatureFlags> {
  return (await getJson<FeatureFlags>('/api/features')) ?? { reviews: false, messaging: false, support: false };
}
