-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('CALLER', 'RECIPIENT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "IdentityStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED');

-- AlterEnum
BEGIN;
CREATE TYPE "AccountStatus_new" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED', 'DELETED');
ALTER TABLE "public"."User" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "status" TYPE "AccountStatus_new" USING ("status"::text::"AccountStatus_new");
ALTER TYPE "AccountStatus" RENAME TO "AccountStatus_old";
ALTER TYPE "AccountStatus_new" RENAME TO "AccountStatus";
DROP TYPE "public"."AccountStatus_old";
ALTER TABLE "User" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "CallStatus_new" AS ENUM ('RINGING', 'ACTIVE', 'COMPLETED', 'REJECTED', 'CANCELLED', 'FAILED', 'TERMINATED');
ALTER TABLE "public"."VideoCall" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "VideoCall" ALTER COLUMN "status" TYPE "CallStatus_new" USING ("status"::text::"CallStatus_new");
ALTER TYPE "CallStatus" RENAME TO "CallStatus_old";
ALTER TYPE "CallStatus_new" RENAME TO "CallStatus";
DROP TYPE "public"."CallStatus_old";
ALTER TABLE "VideoCall" ALTER COLUMN "status" SET DEFAULT 'RINGING';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "TransactionType_new" AS ENUM ('PURCHASE', 'CALL_SPEND', 'EARNING_SETTLED', 'COMMISSION', 'REFUND', 'WITHDRAWAL_HOLD', 'WITHDRAWAL_RELEASE', 'WITHDRAWAL_PAID', 'ADJUSTMENT');
ALTER TABLE "CoinTransaction" ALTER COLUMN "type" TYPE "TransactionType_new" USING ("type"::text::"TransactionType_new");
ALTER TYPE "TransactionType" RENAME TO "TransactionType_old";
ALTER TYPE "TransactionType_new" RENAME TO "TransactionType";
DROP TYPE "public"."TransactionType_old";
COMMIT;

-- DropIndex
DROP INDEX "EmailVerificationToken_email_idx";

-- DropIndex
DROP INDEX "UserSession_expiresAt_idx";

-- AlterTable
ALTER TABLE "CallBillingRecord" DROP COLUMN "commissionCents",
DROP COLUMN "creatorCents",
ADD COLUMN     "companyCredits" INTEGER NOT NULL,
ADD COLUMN     "womanCredits" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "CoinPackage" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "CoinTransaction" ADD COLUMN     "credits" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "coins" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "CompanyCommission" DROP COLUMN "amountCents",
ADD COLUMN     "credits" INTEGER NOT NULL,
ADD COLUMN     "minuteNumber" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "EmailVerificationToken" DROP COLUMN "email",
ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "packageId" TEXT,
ADD COLUMN     "providerSessionId" TEXT,
ADD COLUMN     "refundedCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "providerPaymentId" DROP NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "PayoutAccount" ADD COLUMN     "accountHint" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "country" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "identityStatus" "IdentityStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "legalName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "method" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "name",
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "displayName" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ALTER COLUMN "country" SET NOT NULL,
ALTER COLUMN "country" SET DEFAULT '';

-- AlterTable
ALTER TABLE "UserReport" ADD COLUMN     "callId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "ReportStatus" NOT NULL DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE "VideoCall" ADD COLUMN     "companyCredits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "countryFilter" TEXT NOT NULL DEFAULT 'Worldwide',
ADD COLUMN     "endReason" TEXT,
ADD COLUMN     "lastBilledMinute" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "womanCredits" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "status" SET DEFAULT 'RINGING';

-- AlterTable
ALTER TABLE "Wallet" DROP COLUMN "availableCents",
DROP COLUMN "lifetimeCents",
DROP COLUMN "pendingCents",
ADD COLUMN     "availableCredits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lifetimeCredits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pendingCredits" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WithdrawalRequest" ADD COLUMN     "amountCredits" INTEGER NOT NULL,
ADD COLUMN     "payoutRef" TEXT,
ADD COLUMN     "processedAt" TIMESTAMP(3);

-- DropTable
DROP TABLE "Earnings";

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "adminId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "coinsReversed" INTEGER NOT NULL,
    "providerRefundId" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallParticipant" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL,
    "consentedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "CallParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Earning" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "minuteNumber" INTEGER NOT NULL,
    "credits" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Earning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");

-- CreateIndex
CREATE INDEX "CallParticipant_userId_idx" ON "CallParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CallParticipant_callId_userId_key" ON "CallParticipant"("callId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Earning_idempotencyKey_key" ON "Earning"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Earning_userId_createdAt_idx" ON "Earning"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Earning_status_createdAt_idx" ON "Earning"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Earning_callId_minuteNumber_key" ON "Earning"("callId", "minuteNumber");

-- CreateIndex
CREATE INDEX "AdminAuditLog_action_createdAt_idx" ON "AdminAuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "CoinTransaction_type_createdAt_idx" ON "CoinTransaction"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyCommission_callId_minuteNumber_key" ON "CompanyCommission"("callId", "minuteNumber");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerSessionId_key" ON "Payment"("providerSessionId");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "UserReport_status_createdAt_idx" ON "UserReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "UserReport_reportedId_createdAt_idx" ON "UserReport"("reportedId", "createdAt");

-- CreateIndex
CREATE INDEX "UserSession_userId_expiresAt_idx" ON "UserSession"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_userId_createdAt_idx" ON "WithdrawalRequest"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "CoinPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallParticipant" ADD CONSTRAINT "CallParticipant_callId_fkey" FOREIGN KEY ("callId") REFERENCES "VideoCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallParticipant" ADD CONSTRAINT "CallParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Earning" ADD CONSTRAINT "Earning_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Earning" ADD CONSTRAINT "Earning_callId_fkey" FOREIGN KEY ("callId") REFERENCES "VideoCall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCommission" ADD CONSTRAINT "CompanyCommission_callId_fkey" FOREIGN KEY ("callId") REFERENCES "VideoCall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

