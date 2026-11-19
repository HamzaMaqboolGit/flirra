-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'PROMOTIONAL_REWARD';

-- AlterTable
ALTER TABLE "CoinTransaction" ADD COLUMN     "promotionalCoins" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "guestExpiresAt" TIMESTAMP(3),
ADD COLUMN     "isGuest" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN     "promotionalCoins" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RewardClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rewardType" TEXT NOT NULL,
    "coins" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "claimKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RewardClaim_claimKey_key" ON "RewardClaim"("claimKey");

-- CreateIndex
CREATE INDEX "RewardClaim_userId_rewardType_createdAt_idx" ON "RewardClaim"("userId", "rewardType", "createdAt");

-- AddForeignKey
ALTER TABLE "RewardClaim" ADD CONSTRAINT "RewardClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
