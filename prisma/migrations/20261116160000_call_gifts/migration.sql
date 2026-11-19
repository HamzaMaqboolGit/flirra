ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'GIFT_SENT';

CREATE TABLE "Gift" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "coins" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Gift_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Gift_enabled_sortOrder_idx" ON "Gift"("enabled", "sortOrder");

CREATE TABLE "CallGift" (
    "id" TEXT NOT NULL,
    "giftId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "coins" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CallGift_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CallGift_idempotencyKey_key" ON "CallGift"("idempotencyKey");
CREATE INDEX "CallGift_callId_createdAt_idx" ON "CallGift"("callId", "createdAt");
CREATE INDEX "CallGift_recipientId_createdAt_idx" ON "CallGift"("recipientId", "createdAt");
ALTER TABLE "CallGift" ADD CONSTRAINT "CallGift_giftId_fkey" FOREIGN KEY ("giftId") REFERENCES "Gift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CallGift" ADD CONSTRAINT "CallGift_callId_fkey" FOREIGN KEY ("callId") REFERENCES "VideoCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallGift" ADD CONSTRAINT "CallGift_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CallGift" ADD CONSTRAINT "CallGift_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
