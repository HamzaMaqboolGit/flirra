CREATE TABLE "SubscriptionEntitlement" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'adapty',
  "accessLevelId" TEXT NOT NULL,
  "productId" TEXT,
  "status" TEXT NOT NULL,
  "willRenew" BOOLEAN NOT NULL DEFAULT false,
  "expiresAt" TIMESTAMP(3),
  "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionEntitlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubscriptionEntitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SubscriptionEntitlement_userId_provider_accessLevelId_key" ON "SubscriptionEntitlement"("userId","provider","accessLevelId");
CREATE INDEX "SubscriptionEntitlement_userId_status_expiresAt_idx" ON "SubscriptionEntitlement"("userId","status","expiresAt");
CREATE TABLE "AdaptyEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdaptyEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdaptyEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "AdaptyEvent_userId_receivedAt_idx" ON "AdaptyEvent"("userId","receivedAt");
