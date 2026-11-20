CREATE TABLE "CoordinationState" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CoordinationState_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "CoordinationState_expiresAt_idx" ON "CoordinationState"("expiresAt");
