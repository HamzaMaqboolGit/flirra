ALTER TABLE "Gift"
ADD COLUMN "category" TEXT NOT NULL DEFAULT 'Popular',
ADD COLUMN "featured" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Gift"
SET "category" = CASE
  WHEN lower("name") LIKE '%rose%' OR lower("name") LIKE '%heart%' THEN 'Romantic'
  WHEN lower("name") LIKE '%crown%' OR lower("name") LIKE '%star%' THEN 'Premium'
  ELSE 'Popular'
END;
