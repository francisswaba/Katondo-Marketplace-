-- Sellers choose what kind of product they are selling and how each listing is shown.
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS display_style TEXT NOT NULL DEFAULT 'classic',
  ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_product_type_check;
ALTER TABLE listings ADD CONSTRAINT listings_product_type_check CHECK (product_type IN (
  'fashion', 'electronics', 'vehicles', 'property', 'home', 'food', 'agriculture', 'handmade', 'services', 'general'
));

ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_display_style_check;
ALTER TABLE listings ADD CONSTRAINT listings_display_style_check CHECK (display_style IN (
  'classic', 'gallery', 'spotlight', 'video', 'spec', 'compact'
));

ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_status_check;
ALTER TABLE listings ADD CONSTRAINT listings_status_check CHECK (status IN ('draft', 'published', 'paused', 'removed'));

ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_attributes_object_check;
ALTER TABLE listings ADD CONSTRAINT listings_attributes_object_check CHECK (jsonb_typeof(attributes) = 'object');

-- How each seller's shop page arranges listings.
ALTER TABLE sellers
  ADD COLUMN IF NOT EXISTS storefront_layout TEXT NOT NULL DEFAULT 'grid',
  ADD COLUMN IF NOT EXISTS storefront_tagline TEXT;

ALTER TABLE sellers DROP CONSTRAINT IF EXISTS sellers_storefront_layout_check;
ALTER TABLE sellers ADD CONSTRAINT sellers_storefront_layout_check CHECK (storefront_layout IN ('grid', 'editorial', 'list'));

ALTER TABLE sellers DROP CONSTRAINT IF EXISTS sellers_storefront_tagline_length_check;
ALTER TABLE sellers ADD CONSTRAINT sellers_storefront_tagline_length_check CHECK (storefront_tagline IS NULL OR length(storefront_tagline) <= 140);

CREATE INDEX IF NOT EXISTS listings_country_type_created_idx
  ON listings(country_code, product_type, created_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS listings_seller_created_idx
  ON listings(seller_id, created_at DESC);
