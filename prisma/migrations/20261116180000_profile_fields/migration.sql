ALTER TABLE "UserProfile" ADD COLUMN "city" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmailVerificationToken" ADD COLUMN "pendingEmail" TEXT;
