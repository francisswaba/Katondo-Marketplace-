CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price_minor BIGINT NOT NULL CHECK (price_minor >= 0),
  currency CHAR(3) NOT NULL,
  condition TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES categories(id),
  seller_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO categories (name, slug) VALUES
  ('Electronics', 'electronics'),
  ('Home and Living', 'home-living'),
  ('Fashion', 'fashion'),
  ('Vehicles', 'vehicles')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO listings (title, description, price_minor, currency, condition, category_id, seller_name, quantity)
SELECT 'Example smartphone', 'A sample listing for local development.', 2500000, 'ZMW', 'used', id, 'Katondo Demo Store', 1
FROM categories WHERE slug = 'electronics'
ON CONFLICT DO NOTHING;
