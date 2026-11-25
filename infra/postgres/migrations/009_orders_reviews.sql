-- Orders (minimal: what reviews need) and two-way reviews.
-- Checkout does not create orders yet; reviews stay switched off (REVIEWS_ENABLED) until it does.

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_user_id UUID NOT NULL REFERENCES users(id),
  seller_id UUID NOT NULL REFERENCES sellers(id),
  listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
  listing_title TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  total_minor BIGINT NOT NULL CHECK (total_minor >= 0),
  currency CHAR(3) NOT NULL,
  country_code CHAR(2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'dispatched', 'completed', 'cancelled', 'refunded')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status <> 'completed' OR completed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS orders_buyer_created_idx ON orders(buyer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_seller_created_idx ON orders(seller_id, created_at DESC);

-- One review per side per order. A buyer reviews the seller; a seller reviews the buyer.
-- Reviews are hidden from everyone but their author until both sides have reviewed
-- or the review window has closed (worked out when reading, so no background job is needed).
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  author_role TEXT NOT NULL CHECK (author_role IN ('buyer', 'seller')),
  author_user_id UUID NOT NULL REFERENCES users(id),
  subject_seller_id UUID REFERENCES sellers(id),
  subject_user_id UUID REFERENCES users(id),
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT CHECK (comment IS NULL OR char_length(comment) <= 1000),
  reply TEXT CHECK (reply IS NULL OR char_length(reply) <= 1000),
  replied_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden')),
  hidden_reason TEXT,
  hidden_by_user_id UUID REFERENCES users(id),
  hidden_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, author_role),
  CHECK (
    (author_role = 'buyer' AND subject_seller_id IS NOT NULL AND subject_user_id IS NULL) OR
    (author_role = 'seller' AND subject_user_id IS NOT NULL AND subject_seller_id IS NULL)
  ),
  CHECK (author_role = 'buyer' OR reply IS NULL),
  CHECK ((reply IS NULL) = (replied_at IS NULL)),
  CHECK (status <> 'hidden' OR (hidden_reason IS NOT NULL AND hidden_by_user_id IS NOT NULL AND hidden_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS reviews_subject_seller_idx ON reviews(subject_seller_id, created_at DESC) WHERE author_role = 'buyer';
CREATE INDEX IF NOT EXISTS reviews_subject_user_idx ON reviews(subject_user_id, created_at DESC) WHERE author_role = 'seller';
CREATE INDEX IF NOT EXISTS reviews_status_created_idx ON reviews(status, created_at DESC);
