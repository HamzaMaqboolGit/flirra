-- Seed the editable catalog only when a fresh deployment has no packages.
-- Admins can change prices, quantities, artwork and activation state afterwards.
INSERT INTO "CoinPackage" ("id", "name", "coins", "priceCents", "active", "sortOrder", "currency", "bonusCoins", "cardColor", "popular", "imageUrl", "description", "createdAt", "updatedAt")
SELECT * FROM (VALUES
  ('pkg_spark', 'Spark', 100, 499, true, 1, 'USD', 0, 'spark', false, '/velora-landing/coins/clean/spark.webp', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pkg_glow', 'Glow', 350, 1499, true, 2, 'USD', 0, 'glow', false, '/velora-landing/coins/clean/glow.webp', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pkg_aura', 'Aura', 800, 2999, true, 3, 'USD', 0, 'aura', true, '/velora-landing/coins/clean/aura.webp', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pkg_noir', 'Noir', 1800, 5999, true, 4, 'USD', 0, 'noir', false, '/velora-landing/coins/clean/noir.webp', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
) AS seed("id", "name", "coins", "priceCents", "active", "sortOrder", "currency", "bonusCoins", "cardColor", "popular", "imageUrl", "description", "createdAt", "updatedAt")
WHERE NOT EXISTS (SELECT 1 FROM "CoinPackage");
