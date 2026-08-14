-- Merony Hair.NG – Initial PostgreSQL Schema
-- Production-ready relational model for premium hair ecommerce

BEGIN;

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ============================================================
-- ROLES & USERS
-- ============================================================
CREATE TABLE roles (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(50) NOT NULL UNIQUE, -- customer, admin, manager, inventory_manager, support
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id              BIGSERIAL PRIMARY KEY,
  email           CITEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  first_name      VARCHAR(100),
  last_name       VARCHAR(100),
  phone           VARCHAR(30),
  role_id         INTEGER NOT NULL REFERENCES roles(id),
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  email_verify_token TEXT,
  password_reset_token TEXT,
  password_reset_expires TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role_id);

-- ============================================================
-- ADDRESSES
-- ============================================================
CREATE TABLE addresses (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label         VARCHAR(50), -- home, office
  full_name     VARCHAR(150) NOT NULL,
  phone         VARCHAR(30) NOT NULL,
  street        TEXT NOT NULL,
  landmark      TEXT,
  city          VARCHAR(100) NOT NULL,
  state         VARCHAR(100) NOT NULL, -- Nigerian states
  country       VARCHAR(2) NOT NULL DEFAULT 'NG',
  postal_code   VARCHAR(20),
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_addresses_user ON addresses(user_id);

-- ============================================================
-- CATEGORIES & PRODUCTS
-- ============================================================
CREATE TABLE categories (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  slug        VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  parent_id   INTEGER REFERENCES categories(id),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
  id              BIGSERIAL PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(280) NOT NULL UNIQUE,
  sku_base        VARCHAR(50),
  short_description TEXT,
  description     TEXT,
  category_id     INTEGER REFERENCES categories(id),
  base_price      NUMERIC(12,2) NOT NULL CHECK (base_price >= 0),
  compare_at_price NUMERIC(12,2),
  status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','active','archived')),
  is_featured     BOOLEAN NOT NULL DEFAULT FALSE,
  texture         VARCHAR(50), -- Straight, Body Wave, Deep Wave, Curly, etc.
  density         VARCHAR(20),
  lace_type       VARCHAR(50),
  hair_type       VARCHAR(50) DEFAULT '100% Human Hair',
  origin          VARCHAR(50),
  grade           VARCHAR(30),
  tags            TEXT[], -- array of tags
  rating_avg      NUMERIC(3,2) DEFAULT 0,
  rating_count    INTEGER NOT NULL DEFAULT 0,
  meta_title      VARCHAR(255),
  meta_description TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_slug ON products(slug);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_texture ON products(texture);

-- Product variants (length, color, cap size, etc. with independent price/stock)
CREATE TABLE product_variants (
  id              BIGSERIAL PRIMARY KEY,
  product_id      BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku             VARCHAR(80) NOT NULL UNIQUE,
  name            VARCHAR(150), -- e.g. "18 inch / Natural Black"
  length_inches   INTEGER,
  color           VARCHAR(80),
  density         VARCHAR(20),
  lace_type       VARCHAR(50),
  cap_size        VARCHAR(30),
  price           NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  compare_at_price NUMERIC(12,2),
  stock_quantity  INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  weight_grams    INTEGER,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT available_stock CHECK (stock_quantity >= reserved_quantity)
);

CREATE INDEX idx_variants_product ON product_variants(product_id);
CREATE INDEX idx_variants_sku ON product_variants(sku);

-- Product images
CREATE TABLE product_images (
  id          BIGSERIAL PRIMARY KEY,
  product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id  BIGINT REFERENCES product_variants(id) ON DELETE SET NULL,
  url         TEXT NOT NULL,
  public_id   VARCHAR(255), -- Cloudinary public_id
  alt_text    VARCHAR(255),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_product_images_product ON product_images(product_id);

-- ============================================================
-- INVENTORY TRANSACTIONS
-- ============================================================
CREATE TABLE inventory_transactions (
  id              BIGSERIAL PRIMARY KEY,
  variant_id      BIGINT NOT NULL REFERENCES product_variants(id),
  type            VARCHAR(30) NOT NULL
                  CHECK (type IN ('restock','sale','reservation','release','adjustment','return')),
  quantity        INTEGER NOT NULL, -- can be negative for sales
  reference_type  VARCHAR(30), -- order, manual, etc.
  reference_id    VARCHAR(50),
  note            TEXT,
  created_by      BIGINT REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inv_tx_variant ON inventory_transactions(variant_id);

-- ============================================================
-- CART
-- ============================================================
CREATE TABLE carts (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT REFERENCES users(id) ON DELETE CASCADE,
  session_id  VARCHAR(100), -- for guest carts
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cart_owner CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE UNIQUE INDEX idx_carts_user ON carts(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_carts_session ON carts(session_id) WHERE session_id IS NOT NULL;

CREATE TABLE cart_items (
  id          BIGSERIAL PRIMARY KEY,
  cart_id     BIGINT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id  BIGINT NOT NULL REFERENCES product_variants(id),
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cart_id, variant_id)
);

-- ============================================================
-- WISHLIST
-- ============================================================
CREATE TABLE wishlists (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE wishlist_items (
  id          BIGSERIAL PRIMARY KEY,
  wishlist_id BIGINT NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
  product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id  BIGINT REFERENCES product_variants(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (wishlist_id, product_id, variant_id)
);

-- ============================================================
-- COUPONS
-- ============================================================
CREATE TABLE coupons (
  id                BIGSERIAL PRIMARY KEY,
  code              VARCHAR(50) NOT NULL UNIQUE,
  type              VARCHAR(20) NOT NULL CHECK (type IN ('percentage','fixed')),
  value             NUMERIC(12,2) NOT NULL CHECK (value > 0),
  min_order_amount  NUMERIC(12,2) DEFAULT 0,
  max_discount      NUMERIC(12,2),
  usage_limit       INTEGER,
  usage_count       INTEGER NOT NULL DEFAULT 0,
  per_customer_limit INTEGER DEFAULT 1,
  starts_at         TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE coupon_usages (
  id          BIGSERIAL PRIMARY KEY,
  coupon_id   BIGINT NOT NULL REFERENCES coupons(id),
  user_id     BIGINT REFERENCES users(id),
  order_id    BIGINT, -- filled after order creation
  discount_amount NUMERIC(12,2) NOT NULL,
  used_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ORDERS
-- ============================================================
CREATE TABLE orders (
  id                BIGSERIAL PRIMARY KEY,
  order_number      VARCHAR(30) NOT NULL UNIQUE, -- MH-XXXXXX
  user_id           BIGINT REFERENCES users(id),
  email             CITEXT NOT NULL,
  phone             VARCHAR(30),
  status            VARCHAR(30) NOT NULL DEFAULT 'PENDING_PAYMENT'
                    CHECK (status IN (
                      'PENDING_PAYMENT','PAID','PROCESSING','PACKED',
                      'SHIPPED','OUT_FOR_DELIVERY','DELIVERED',
                      'CANCELLED','REFUNDED'
                    )),
  payment_status    VARCHAR(30) NOT NULL DEFAULT 'pending'
                    CHECK (payment_status IN ('pending','paid','failed','refunded','partially_refunded')),
  subtotal          NUMERIC(12,2) NOT NULL,
  discount_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  total             NUMERIC(12,2) NOT NULL,
  currency          VARCHAR(3) NOT NULL DEFAULT 'NGN',
  coupon_id         BIGINT REFERENCES coupons(id),
  shipping_method   VARCHAR(50),
  shipping_address  JSONB NOT NULL, -- snapshot
  billing_address   JSONB,
  notes             TEXT,
  paid_at           TIMESTAMPTZ,
  shipped_at        TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_created ON orders(created_at DESC);

CREATE TABLE order_items (
  id              BIGSERIAL PRIMARY KEY,
  order_id        BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id      BIGINT REFERENCES product_variants(id),
  product_id      BIGINT NOT NULL REFERENCES products(id),
  product_name    VARCHAR(255) NOT NULL, -- snapshot
  variant_name    VARCHAR(150),
  sku             VARCHAR(80),
  unit_price      NUMERIC(12,2) NOT NULL,
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  line_total      NUMERIC(12,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TABLE payments (
  id                BIGSERIAL PRIMARY KEY,
  order_id          BIGINT NOT NULL REFERENCES orders(id),
  provider          VARCHAR(30) NOT NULL DEFAULT 'paystack',
  provider_reference VARCHAR(100),
  amount            NUMERIC(12,2) NOT NULL,
  currency          VARCHAR(3) NOT NULL DEFAULT 'NGN',
  status            VARCHAR(30) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','success','failed','abandoned','reversed')),
  channel           VARCHAR(30),
  paid_at           TIMESTAMPTZ,
  raw_response      JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_reference ON payments(provider_reference);

CREATE TABLE payment_events (
  id              BIGSERIAL PRIMARY KEY,
  payment_id      BIGINT REFERENCES payments(id),
  provider        VARCHAR(30) NOT NULL,
  event_type      VARCHAR(80) NOT NULL,
  provider_event_id VARCHAR(120),
  payload         JSONB NOT NULL,
  signature_valid BOOLEAN,
  processed       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_payment_events_provider_id
  ON payment_events(provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

-- ============================================================
-- REVIEWS
-- ============================================================
CREATE TABLE reviews (
  id              BIGSERIAL PRIMARY KEY,
  product_id      BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id         BIGINT NOT NULL REFERENCES users(id),
  order_id        BIGINT REFERENCES orders(id),
  rating          SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title           VARCHAR(200),
  body            TEXT,
  is_verified_purchase BOOLEAN NOT NULL DEFAULT FALSE,
  is_approved     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, user_id, order_id)
);

CREATE INDEX idx_reviews_product ON reviews(product_id);

-- ============================================================
-- LOYALTY
-- ============================================================
CREATE TABLE loyalty_accounts (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  points_balance  INTEGER NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
  lifetime_points INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE loyalty_transactions (
  id              BIGSERIAL PRIMARY KEY,
  account_id      BIGINT NOT NULL REFERENCES loyalty_accounts(id),
  type            VARCHAR(30) NOT NULL
                  CHECK (type IN ('earn','redeem','adjust','expire','bonus')),
  points          INTEGER NOT NULL,
  balance_after   INTEGER NOT NULL,
  reference_type  VARCHAR(30),
  reference_id    VARCHAR(50),
  note            TEXT,
  created_by      BIGINT REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CONTACT & NEWSLETTER
-- ============================================================
CREATE TABLE contact_messages (
  id          BIGSERIAL PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  email       CITEXT NOT NULL,
  phone       VARCHAR(30),
  subject     VARCHAR(200),
  message     TEXT NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'new'
              CHECK (status IN ('new','read','replied','archived')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE newsletter_subscribers (
  id          BIGSERIAL PRIMARY KEY,
  email       CITEXT NOT NULL UNIQUE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  source      VARCHAR(50),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS & AUDIT
-- ============================================================
CREATE TABLE notifications (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,
  title       VARCHAR(255) NOT NULL,
  body        TEXT,
  data        JSONB,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    BIGINT REFERENCES users(id),
  action      VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id   VARCHAR(50),
  ip_address  INET,
  user_agent  TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- ============================================================
-- SHIPPING CONFIG (admin configurable)
-- ============================================================
CREATE TABLE shipping_methods (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(80) NOT NULL,
  code            VARCHAR(40) NOT NULL UNIQUE,
  description     TEXT,
  base_price      NUMERIC(12,2) NOT NULL DEFAULT 0,
  estimated_days_min INTEGER,
  estimated_days_max INTEGER,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INTEGER NOT NULL DEFAULT 0
);

COMMIT;
