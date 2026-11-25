-- Development sample data only. Never run against staging or production.
INSERT INTO categories (name, slug) VALUES
  ('Electronics', 'electronics'),
  ('Home and Living', 'home-living'),
  ('Fashion', 'fashion'),
  ('Vehicles', 'vehicles'),
  ('Property', 'property'),
  ('Food and Groceries', 'food-groceries'),
  ('Farm and Agriculture', 'farm-agriculture'),
  ('Art and Handmade', 'art-handmade'),
  ('Services', 'services')
ON CONFLICT (slug) DO NOTHING;

WITH samples(title, description, price_minor, condition, slug, seller, quantity, product_type, display_style, attributes) AS (
  VALUES
    ('Toyota Hilux 2.8 GD-6 double cab', 'One owner, full service history at the Lusaka dealer. New tyres, canopy included.', 48500000, 'used', 'vehicles', 'Kabwe Motors', 1, 'vehicles', 'spotlight', '{"make":"Toyota","model":"Hilux 2.8 GD-6","year":"2019","mileage":"84,000","transmission":"Manual","fuel":"Diesel"}'),
    ('Samsung Galaxy A56, 256 GB', 'Sealed in box with a local 12-month warranty. Dual SIM.', 899900, 'new', 'electronics', 'Cairo Road Mobiles', 6, 'electronics', 'spec', '{"brand":"Samsung","model":"Galaxy A56","storage":"256 GB","warranty":"12 months"}'),
    ('Chitenge wrap dress', 'Hand-cut from Zambian wax print. Made to order in sizes 8 to 18.', 65000, 'new', 'fashion', 'Mwila Atelier', 12, 'fashion', 'gallery', '{"size":"8–18","colour":"Indigo and copper"}'),
    ('Copper and kiaat wall sculpture', 'Beaten copper set into a kiaat frame. One of a kind, signed by the artist.', 420000, 'new', 'art-handmade', 'Kafue Studio', 1, 'handmade', 'video', '{"maker":"Chanda M.","materials":"Copper, kiaat","dimensions":"60 × 90 cm"}'),
    ('3-bedroom house, Ibex Hill', 'Self-contained main, borehole, solar backup, walled garden with gate motor.', 650000000, 'used', 'property', 'Katondo Homes', 1, 'property', 'spotlight', '{"offer":"For sale","bedrooms":"3","bathrooms":"2","area":"1,200","location":"Ibex Hill, Lusaka"}'),
    ('White maize, 50 kg bag', 'This season’s harvest, dried and cleaned. Collection or delivery in Lusaka.', 32000, 'new', 'farm-agriculture', 'Mkushi Growers Co-op', 40, 'agriculture', 'compact', '{"unit":"50 kg bag","available":"40 bags","location":"Mkushi"}'),
    ('Mukwa coffee table', 'Solid mukwa with an oil finish. Seats a family of six around it.', 280000, 'like new', 'home-living', 'Woodcraft Chilenje', 2, 'home', 'classic', '{"material":"Mukwa wood","dimensions":"120 × 60 cm"}'),
    ('Fresh kapenta, 1 kg', 'Sun-dried Siavonga kapenta, cleaned and packed this week.', 18500, 'new', 'food-groceries', 'Siavonga Fresh', 30, 'food', 'compact', '{"unit":"1 kg pack"}'),
    ('Solar installation, home kit', 'Site visit, 3 kW panels and inverter fitted in a day.', 1500000, 'new', 'services', 'SunPower Lusaka', 5, 'services', 'classic', '{"serviceArea":"Lusaka and Chilanga","duration":"1 day"}')
)
INSERT INTO listings (title, description, price_minor, currency, condition, category_id, seller_name, quantity, product_type, display_style, attributes, status, country_code)
SELECT s.title, s.description, s.price_minor, 'ZMW', s.condition, c.id, s.seller, s.quantity, s.product_type, s.display_style, s.attributes::jsonb, 'published', 'ZM'
FROM samples s
JOIN categories c ON c.slug = s.slug
WHERE NOT EXISTS (SELECT 1 FROM listings l WHERE l.title = s.title AND l.seller_name = s.seller);
