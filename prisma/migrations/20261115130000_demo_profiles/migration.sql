CREATE TABLE "DemoProfile" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "gender" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "bio" TEXT NOT NULL DEFAULT '',
    "interests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DemoProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DemoProfile_username_key" ON "DemoProfile"("username");
CREATE INDEX "DemoProfile_gender_country_createdAt_idx" ON "DemoProfile"("gender", "country", "createdAt");
