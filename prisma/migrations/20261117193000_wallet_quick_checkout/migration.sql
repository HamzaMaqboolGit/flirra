ALTER TABLE "User" ADD COLUMN "stripeCustomerId" TEXT;
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
ALTER TABLE "Payment" ADD COLUMN "checkoutRequestId" TEXT;
CREATE UNIQUE INDEX "Payment_checkoutRequestId_key" ON "Payment"("checkoutRequestId");
ALTER TABLE "Payment" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
