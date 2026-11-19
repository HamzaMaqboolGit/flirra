CREATE TABLE "UserStoryView" (
    "viewerId" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserStoryView_pkey" PRIMARY KEY ("viewerId", "storyId")
);

CREATE INDEX "UserStoryView_storyId_viewedAt_idx" ON "UserStoryView"("storyId", "viewedAt");

ALTER TABLE "UserStoryView" ADD CONSTRAINT "UserStoryView_viewerId_fkey"
    FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserStoryView" ADD CONSTRAINT "UserStoryView_storyId_fkey"
    FOREIGN KEY ("storyId") REFERENCES "UserStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
