-- Settings created by the previous application bootstrap stored default numeric
-- values as JSON numbers. Remove only rows that still equal those generated
-- values; settings with a different manually saved value remain untouched.
ALTER TABLE "PlatformSetting" ALTER COLUMN "value" DROP NOT NULL;

DELETE FROM "PlatformSetting"
WHERE ("key", "value") IN (
  ('coinsPerMinute', '10'::jsonb),
  ('womanShareBps', '7000'::jsonb),
  ('minWithdrawalCredits', '1000'::jsonb),
  ('creditValueCents', '1'::jsonb),
  ('callRingSeconds', '25'::jsonb),
  ('guestWelcomeCoins', '20'::jsonb),
  ('registeredWelcomeCoins', '50'::jsonb),
  ('dailyRewardCoins', '10'::jsonb),
  ('promoRewardCoins', '25'::jsonb),
  ('rewardExpirationDays', '90'::jsonb),
  ('maxPromoCoins', '500'::jsonb)
);

-- Keep historical catalog rows and payment references intact, but stop exposing
-- the packages and gifts created by the old startup seeder as purchasable.
UPDATE "CoinPackage"
SET "active" = false
WHERE ("name", "coins", "priceCents", "sortOrder") IN (
  ('Spark', 100, 499, 1),
  ('Glow', 350, 1499, 2),
  ('Aura', 800, 2999, 3),
  ('Noir', 1800, 5999, 4)
);

UPDATE "Gift"
SET "enabled" = false
WHERE ("name", "imageUrl", "coins", "sortOrder") IN (
  ('Rose', '🌹', 10, 1),
  ('Heart', '💜', 25, 2),
  ('Sparkles', '✨', 50, 3),
  ('Crown', '👑', 100, 4),
  ('Star', '⭐', 250, 5)
);
