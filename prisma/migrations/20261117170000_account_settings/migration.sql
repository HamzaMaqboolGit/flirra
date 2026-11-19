ALTER TABLE "User" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "UserProfile" ADD COLUMN "accountSettings" JSONB NOT NULL DEFAULT '{}'::jsonb;
