CREATE TABLE "GuestMilestone" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "milestone" TEXT NOT NULL,
  "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuestMilestone_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GuestMilestone_userId_milestone_key" ON "GuestMilestone"("userId", "milestone");
CREATE INDEX "GuestMilestone_userId_dismissedAt_idx" ON "GuestMilestone"("userId", "dismissedAt");
ALTER TABLE "GuestMilestone" ADD CONSTRAINT "GuestMilestone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
