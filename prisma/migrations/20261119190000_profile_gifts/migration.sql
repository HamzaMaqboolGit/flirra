ALTER TABLE "CallGift" ALTER COLUMN "callId" DROP NOT NULL;
ALTER TABLE "CallGift" ADD COLUMN "conversationId" TEXT;
ALTER TABLE "CallGift" ADD CONSTRAINT "CallGift_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "CallGift_conversationId_createdAt_idx" ON "CallGift"("conversationId", "createdAt");
