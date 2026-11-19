ALTER TABLE "UserReport" ADD COLUMN "conversationId" TEXT,
ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'NORMAL',
ADD COLUMN "severity" TEXT NOT NULL DEFAULT 'UNASSESSED',
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'USER_REPORT',
ADD COLUMN "evidenceRef" TEXT,
ADD COLUMN "reviewedById" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewNotes" TEXT,
ADD COLUMN "appealStatus" TEXT NOT NULL DEFAULT 'NONE';
CREATE INDEX "UserReport_priority_createdAt_idx" ON "UserReport"("priority", "createdAt");
ALTER TABLE "UserReport" ADD CONSTRAINT "UserReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
