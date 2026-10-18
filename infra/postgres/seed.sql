INSERT INTO categories (name, slug) VALUES
  ('Electronics', 'electronics'),
  ('Home and Living', 'home-living'),
  ('Fashion', 'fashion'),
  ('Vehicles', 'vehicles')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO listings (title, description, price_minor, currency, condition, category_id, seller_name, quantity)
SELECT 'Example smartphone', 'A sample listing for local development.', 2500000, 'ZMW', 'used', id, 'Katondo Demo Store', 1
FROM categories WHERE slug = 'electronics'
AND NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Example smartphone' AND seller_name = 'Katondo Demo Store');
