CREATE TABLE "CmsPage" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "draftContent" JSONB NOT NULL,
  "publishedContent" JSONB,
  "publishedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CmsPage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CmsPage_slug_key" ON "CmsPage"("slug");

CREATE TABLE "CmsRevision" (
  "id" TEXT NOT NULL,
  "pageId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CmsRevision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CmsRevision_pageId_createdAt_idx" ON "CmsRevision"("pageId", "createdAt");
ALTER TABLE "CmsRevision" ADD CONSTRAINT "CmsRevision_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "CmsPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CmsRevision" ADD CONSTRAINT "CmsRevision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CmsMedia" (
  "id" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "altText" TEXT NOT NULL DEFAULT '',
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CmsMedia_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CmsMedia_url_key" ON "CmsMedia"("url");
CREATE INDEX "CmsMedia_createdAt_idx" ON "CmsMedia"("createdAt");
ALTER TABLE "CmsMedia" ADD CONSTRAINT "CmsMedia_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
