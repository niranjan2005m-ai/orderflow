-- ============================================================
-- ORDERFLOW – Seed data
-- Inserts the three demo products used throughout the project.
-- ============================================================
INSERT INTO products (id, name, price, stock) VALUES
  (1, 'Keyboard', 2500.00, 10),
  (2, 'Mouse',    1000.00, 20),
  (3, 'Monitor',  12000.00, 5)
ON CONFLICT (id) DO NOTHING;

-- Reset the sequence so the next auto-generated id starts at 4
SELECT setval('products_id_seq', 3, true);
