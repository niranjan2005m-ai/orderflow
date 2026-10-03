-- ============================================================
-- ORDERFLOW – Database initialisation
-- Run once when the Postgres container starts for the first time.
-- ============================================================

-- ---- Inventory (owned by inventory-service) ----------------
CREATE TABLE IF NOT EXISTS products (
  id    SERIAL PRIMARY KEY,
  name  TEXT    NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  stock INT     NOT NULL CHECK (stock >= 0)
);

-- ---- Orders (owned by order-service) -----------------------
CREATE TABLE IF NOT EXISTS orders (
  id            SERIAL PRIMARY KEY,
  customer_name TEXT    NOT NULL,
  product_id    INT     NOT NULL REFERENCES products(id),
  quantity      INT     NOT NULL,
  price         NUMERIC(10, 2) NOT NULL,   -- unit price at time of order
  status        TEXT    NOT NULL DEFAULT 'CONFIRMED'
                        CHECK (status IN ('PENDING','CONFIRMED','CANCELLED')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Transactional Outbox (owned by order-service) ---------
-- Each row represents a domain event that must be published to Kafka.
-- published_at is NULL until the outbox publisher loop processes it.
CREATE TABLE IF NOT EXISTS outbox_events (
  id           SERIAL PRIMARY KEY,
  event_type   TEXT        NOT NULL,          -- e.g. 'order.created'
  aggregate_id INT         NOT NULL,          -- the order id
  payload      JSONB       NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ             -- NULL = not yet published
);
