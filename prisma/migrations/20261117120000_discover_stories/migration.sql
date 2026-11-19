CREATE TABLE "UserStory" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "mediaUrl" TEXT NOT NULL,
  "mediaType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
  CONSTRAINT "UserStory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UserStory_ownerId_expiresAt_idx" ON "UserStory"("ownerId", "expiresAt");
CREATE INDEX "UserStory_visibility_expiresAt_idx" ON "UserStory"("visibility", "expiresAt");
ALTER TABLE "UserStory" ADD CONSTRAINT "UserStory_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "StoryReport" (
  "id" TEXT NOT NULL,
  "storyId" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "details" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoryReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StoryReport_storyId_reporterId_key" ON "StoryReport"("storyId", "reporterId");
CREATE INDEX "StoryReport_status_createdAt_idx" ON "StoryReport"("status", "createdAt");
ALTER TABLE "StoryReport" ADD CONSTRAINT "StoryReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoryReport" ADD CONSTRAINT "StoryReport_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
