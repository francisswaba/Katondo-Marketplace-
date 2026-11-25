import { Router, type NextFunction, type Response } from 'express';
import type { Pool } from 'pg';
import {
  displayStyleIds,
  displayStyles,
  getProductType,
  productTypeIds,
  productTypes,
  storefrontLayoutIds,
  storefrontLayouts,
  type DisplayStyle,
  type Listing,
  type ListingAttributes,
  type ListingDraft,
  type ListingResponse,
  type ProductType,
  type StorefrontLayout,
  type StorefrontResponse,
} from '@katondo/contracts';
import { requireAnyRole, type AuthenticatedRequest } from './access.js';
import { recordActivity } from './activity.js';
import { findPlatformUserId } from './identity.js';
import { getMarketConfiguration } from './market.js';

type Authenticate = (request: AuthenticatedRequest, response: Response, next: NextFunction) => Promise<void>;

const sellerRoles = ['individual_seller', 'business_seller'] as const;
const mediaBaseUrl = (process.env.MEDIA_BASE_URL ?? '').replace(/\/$/, '');
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Columns every listing query selects, so rows map the same way everywhere. */
export const listingColumns = `
  l.id, l.title, l.description, l.price_minor, l.currency, l.condition,
  l.category_id, c.name AS category_name, l.seller_id, l.seller_name, l.quantity,
  l.product_type, l.display_style, l.attributes, l.created_at,
  COALESCE((
    SELECT json_agg(json_build_object('type', m.media_type, 'key', m.object_key) ORDER BY m.sort_order)
    FROM listing_media m WHERE m.listing_id = l.id
  ), '[]'::json) AS media
`;

export function mapListingRow(row: Record<string, any>): Listing {
  const media = Array.isArray(row.media) ? row.media : [];
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priceMinor: Number(row.price_minor),
    currency: String(row.currency).trim(),
    condition: row.condition,
    categoryId: row.category_id,
    categoryName: row.category_name,
    sellerId: row.seller_id ?? null,
    sellerName: row.seller_name,
    quantity: row.quantity,
    productType: (productTypeIds.includes(row.product_type) ? row.product_type : 'general') as ProductType,
    displayStyle: (displayStyleIds.includes(row.display_style) ? row.display_style : 'classic') as DisplayStyle,
    attributes: row.attributes && typeof row.attributes === 'object' ? row.attributes : {},
    // Media only resolves to a URL once a media store is configured; until then cards use type artwork.
    media: mediaBaseUrl
      ? media.map((item: { type: 'image' | 'video'; key: string }) => ({ type: item.type, url: `${mediaBaseUrl}/${encodeURI(item.key)}` }))
      : [],
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

/** Validates a full or partial listing body. Returns the cleaned values or an error message. */
export function validateListingInput(body: Record<string, unknown> | undefined, partial: boolean):
  { value: Partial<ListingDraft> } | { error: string } {
  const input = body ?? {};
  const value: Partial<ListingDraft> = {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key);

  if (!partial || has('productType')) {
    if (!productTypeIds.includes(input.productType as ProductType)) return { error: 'Choose what kind of product you are selling.' };
    value.productType = input.productType as ProductType;
  }
  if (!partial || has('displayStyle')) {
    if (!displayStyleIds.includes(input.displayStyle as DisplayStyle)) return { error: 'Choose how your listing should be displayed.' };
    value.displayStyle = input.displayStyle as DisplayStyle;
  }
  if (!partial || has('title')) {
    const title = text(input.title);
    if (title.length < 3 || title.length > 120) return { error: 'Use a title between 3 and 120 characters.' };
    value.title = title;
  }
  if (!partial || has('description')) {
    const description = text(input.description);
    if (description.length < 10 || description.length > 5000) return { error: 'Describe the item in 10 to 5,000 characters.' };
    value.description = description;
  }
  if (!partial || has('priceMinor')) {
    const price = Number(input.priceMinor);
    if (!Number.isSafeInteger(price) || price < 0 || price > 100_000_000_000) return { error: 'Enter a valid price.' };
    value.priceMinor = price;
  }
  if (!partial || has('quantity')) {
    const quantity = Number(input.quantity);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100_000) return { error: 'Enter a quantity between 0 and 100,000.' };
    value.quantity = quantity;
  }
  if (!partial || has('categoryId')) {
    if (typeof input.categoryId !== 'string' || !uuidPattern.test(input.categoryId)) return { error: 'Choose a category.' };
    value.categoryId = input.categoryId;
  }
  if (!partial || has('condition') || has('productType')) {
    const condition = text(input.condition);
    const type = getProductType((value.productType ?? input.productType) as string);
    if (condition && !type.conditions.includes(condition)) return { error: `Choose a condition: ${type.conditions.join(', ')}.` };
    if (!partial && !condition) return { error: 'Choose the item’s condition.' };
    if (condition) value.condition = condition;
  }
  if (!partial || has('attributes')) {
    const raw = input.attributes && typeof input.attributes === 'object' && !Array.isArray(input.attributes)
      ? input.attributes as Record<string, unknown>
      : {};
    const type = getProductType((value.productType ?? input.productType) as string);
    const attributes: ListingAttributes = {};
    for (const field of type.fields) {
      const fieldValue = text(raw[field.key]);
      if (!fieldValue) continue;
      if (fieldValue.length > 120) return { error: `${field.label} must be 120 characters or fewer.` };
      if (field.options && !field.options.includes(fieldValue)) return { error: `Choose a valid option for ${field.label.toLowerCase()}.` };
      attributes[field.key] = fieldValue;
    }
    value.attributes = attributes;
  }
  return { value };
}

export function createListingsRouter(pool: Pool, authenticate: Authenticate) {
  const router = Router();
  const market = getMarketConfiguration();
  const requireSeller = requireAnyRole([...sellerRoles]);

  async function sellerForRequest(request: AuthenticatedRequest) {
    const userId = await findPlatformUserId(pool, request.user!);
    if (!userId) return null;
    const result = await pool.query(
      'SELECT id, display_name, verification_status FROM sellers WHERE user_id = $1',
      [userId],
    );
    return result.rows[0] as { id: string; display_name: string; verification_status: string } | undefined ?? null;
  }

  router.get('/api/listing-options', (_request, response) => {
    response.json({ productTypes, displayStyles, storefrontLayouts });
  });

  router.get('/api/listings/:listingId', async (request: AuthenticatedRequest, response) => {
    const listingId = String(request.params.listingId);
    if (!uuidPattern.test(listingId)) {
      response.status(404).json({ error: 'Listing not found.' });
      return;
    }
    try {
      const result = await pool.query(`
        SELECT ${listingColumns}
        FROM listings l JOIN categories c ON c.id = l.category_id
        WHERE l.id = $1 AND l.country_code = $2 AND l.status = 'published'
      `, [listingId, market.countryCode]);
      if (!result.rows[0]) {
        response.status(404).json({ error: 'Listing not found.' });
        return;
      }
      await recordActivity(pool, request, 'buyer', 'buyer.listing_viewed', { subjectType: 'listing', subjectId: listingId });
      const payload: ListingResponse = { market, listing: mapListingRow(result.rows[0]) };
      response.json(payload);
    } catch (error) {
      console.error('Listing request failed', error);
      response.status(503).json({ error: 'This listing is temporarily unavailable.' });
    }
  });

  router.get('/api/shops/:sellerId', async (request: AuthenticatedRequest, response) => {
    const sellerId = String(request.params.sellerId);
    if (!uuidPattern.test(sellerId)) {
      response.status(404).json({ error: 'Shop not found.' });
      return;
    }
    try {
      const seller = await pool.query(`
        SELECT id, display_name, seller_type, verification_status, storefront_layout, storefront_tagline
        FROM sellers
        WHERE id = $1 AND (verification_status = 'verified' OR seller_type = 'platform')
      `, [sellerId]);
      if (!seller.rows[0]) {
        response.status(404).json({ error: 'Shop not found.' });
        return;
      }
      const listings = await pool.query(`
        SELECT ${listingColumns}
        FROM listings l JOIN categories c ON c.id = l.category_id
        WHERE l.seller_id = $1 AND l.country_code = $2 AND l.status = 'published'
        ORDER BY l.created_at DESC LIMIT 200
      `, [sellerId, market.countryCode]);
      const row = seller.rows[0];
      const payload: StorefrontResponse = {
        market,
        storefront: {
          id: row.id,
          displayName: row.display_name,
          sellerType: row.seller_type,
          verificationStatus: row.verification_status,
          layout: row.storefront_layout,
          tagline: row.storefront_tagline,
        },
        listings: listings.rows.map(mapListingRow),
      };
      response.json(payload);
    } catch (error) {
      console.error('Shop request failed', error);
      response.status(503).json({ error: 'This shop is temporarily unavailable.' });
    }
  });

  router.get('/api/seller/listings', authenticate, requireSeller, async (request: AuthenticatedRequest, response) => {
    try {
      const seller = await sellerForRequest(request);
      if (!seller) {
        response.json({ seller: null, listings: [] });
        return;
      }
      const listings = await pool.query(`
        SELECT ${listingColumns}, l.status
        FROM listings l JOIN categories c ON c.id = l.category_id
        WHERE l.seller_id = $1 AND l.status <> 'removed'
        ORDER BY l.created_at DESC
      `, [seller.id]);
      response.json({
        seller: { id: seller.id, displayName: seller.display_name, verificationStatus: seller.verification_status },
        listings: listings.rows.map((row) => ({ ...mapListingRow(row), status: row.status })),
      });
    } catch (error) {
      console.error('Seller listings request failed', error);
      response.status(503).json({ error: 'Your listings are temporarily unavailable.' });
    }
  });

  router.post('/api/seller/listings', authenticate, requireSeller, async (request: AuthenticatedRequest, response) => {
    const parsed = validateListingInput(request.body, false);
    if ('error' in parsed) {
      response.status(400).json({ error: parsed.error });
      return;
    }
    const listing = parsed.value as ListingDraft;
    try {
      const seller = await sellerForRequest(request);
      if (!seller) {
        response.status(403).json({ error: 'Apply to become a seller before creating listings.' });
        return;
      }
      // Unverified sellers can prepare drafts; only verified sellers can publish.
      const wantsPublish = request.body?.publish === true;
      if (wantsPublish && seller.verification_status !== 'verified') {
        response.status(403).json({ error: 'Your listing was not published. Listings go live once your seller account is verified.' });
        return;
      }
      const result = await pool.query(`
        INSERT INTO listings (
          title, description, price_minor, currency, condition, category_id, seller_id, seller_name,
          quantity, product_type, display_style, attributes, status, country_code
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id, status
      `, [
        listing.title, listing.description, listing.priceMinor, market.currency, listing.condition,
        listing.categoryId, seller.id, seller.display_name, listing.quantity, listing.productType,
        listing.displayStyle, JSON.stringify(listing.attributes), wantsPublish ? 'published' : 'draft', market.countryCode,
      ]);
      await recordActivity(pool, request, 'seller', 'seller.listing_created', {
        subjectType: 'listing',
        subjectId: result.rows[0].id,
        metadata: { productType: listing.productType, displayStyle: listing.displayStyle, status: result.rows[0].status },
      });
      response.status(201).json({ listing: result.rows[0] });
    } catch (error) {
      if ((error as { code?: string }).code === '23503') {
        response.status(400).json({ error: 'Choose a category that exists.' });
        return;
      }
      console.error('Listing creation failed', error);
      response.status(503).json({ error: 'Your listing could not be saved. Try again in a moment.' });
    }
  });

  router.patch('/api/seller/listings/:listingId', authenticate, requireSeller, async (request: AuthenticatedRequest, response) => {
    const listingId = String(request.params.listingId);
    const parsed = validateListingInput(request.body, true);
    if (!uuidPattern.test(listingId) || 'error' in parsed) {
      response.status(400).json({ error: 'error' in parsed ? parsed.error : 'Listing not found.' });
      return;
    }
    const status = request.body?.status;
    if (status !== undefined && !['draft', 'published', 'paused', 'removed'].includes(status)) {
      response.status(400).json({ error: 'Choose a valid listing status.' });
      return;
    }
    try {
      const seller = await sellerForRequest(request);
      if (!seller) {
        response.status(404).json({ error: 'Listing not found.' });
        return;
      }
      if (status === 'published' && seller.verification_status !== 'verified') {
        response.status(403).json({ error: 'Listings go live once your seller account is verified.' });
        return;
      }
      const columnMap: Record<string, string> = {
        title: 'title', description: 'description', priceMinor: 'price_minor', quantity: 'quantity',
        categoryId: 'category_id', condition: 'condition', productType: 'product_type',
        displayStyle: 'display_style', attributes: 'attributes',
      };
      const updates: string[] = [];
      const values: unknown[] = [];
      for (const [key, column] of Object.entries(columnMap)) {
        const fieldValue = (parsed.value as Record<string, unknown>)[key];
        if (fieldValue === undefined) continue;
        values.push(key === 'attributes' ? JSON.stringify(fieldValue) : fieldValue);
        updates.push(`${column} = $${values.length}`);
      }
      if (status) {
        values.push(status);
        updates.push(`status = $${values.length}`);
      }
      if (!updates.length) {
        response.status(400).json({ error: 'Nothing to update.' });
        return;
      }
      values.push(listingId, seller.id);
      const result = await pool.query(`
        UPDATE listings SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${values.length - 1} AND seller_id = $${values.length}
        RETURNING id, status, display_style
      `, values);
      if (!result.rowCount) {
        response.status(404).json({ error: 'Listing not found.' });
        return;
      }
      await recordActivity(pool, request, 'seller', 'seller.listing_updated', {
        subjectType: 'listing',
        subjectId: listingId,
        metadata: { fields: Object.keys(parsed.value), status: result.rows[0].status },
      });
      response.json({ listing: result.rows[0] });
    } catch (error) {
      console.error('Listing update failed', error);
      response.status(503).json({ error: 'Your changes could not be saved. Try again in a moment.' });
    }
  });

  router.patch('/api/seller/storefront', authenticate, requireSeller, async (request: AuthenticatedRequest, response) => {
    const layout = request.body?.layout as StorefrontLayout | undefined;
    const tagline = request.body?.tagline;
    if (layout !== undefined && !storefrontLayoutIds.includes(layout)) {
      response.status(400).json({ error: 'Choose a shop layout.' });
      return;
    }
    if (tagline !== undefined && tagline !== null && (typeof tagline !== 'string' || tagline.trim().length > 140)) {
      response.status(400).json({ error: 'Keep your shop tagline to 140 characters or fewer.' });
      return;
    }
    try {
      const seller = await sellerForRequest(request);
      if (!seller) {
        response.status(403).json({ error: 'Apply to become a seller before setting up a shop.' });
        return;
      }
      const result = await pool.query(`
        UPDATE sellers SET
          storefront_layout = COALESCE($1, storefront_layout),
          storefront_tagline = CASE WHEN $2::boolean THEN NULLIF($3, '') ELSE storefront_tagline END
        WHERE id = $4
        RETURNING storefront_layout, storefront_tagline
      `, [layout ?? null, tagline !== undefined, typeof tagline === 'string' ? tagline.trim() : '', seller.id]);
      await recordActivity(pool, request, 'seller', 'seller.storefront_updated', { subjectType: 'seller', subjectId: seller.id });
      response.json({ layout: result.rows[0].storefront_layout, tagline: result.rows[0].storefront_tagline });
    } catch (error) {
      console.error('Storefront update failed', error);
      response.status(503).json({ error: 'Your shop settings could not be saved. Try again in a moment.' });
    }
  });

  return router;
}
