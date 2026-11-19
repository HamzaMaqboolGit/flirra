ALTER TABLE "VideoCall"
  ADD COLUMN "hiddenForCaller" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hiddenForRecipient" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Conversation" (
  "id" TEXT NOT NULL,
  "memberAId" TEXT NOT NULL,
  "memberBId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "clientId" TEXT,
  "body" VARCHAR(2000) NOT NULL,
  "attachmentUrl" TEXT,
  "attachmentPath" TEXT,
  "attachmentMime" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Conversation_memberAId_memberBId_key" ON "Conversation"("memberAId", "memberBId");
CREATE INDEX "Conversation_memberAId_updatedAt_idx" ON "Conversation"("memberAId", "updatedAt");
CREATE INDEX "Conversation_memberBId_updatedAt_idx" ON "Conversation"("memberBId", "updatedAt");
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");
CREATE INDEX "ChatMessage_conversationId_readAt_senderId_idx" ON "ChatMessage"("conversationId", "readAt", "senderId");
CREATE UNIQUE INDEX "ChatMessage_senderId_clientId_key" ON "ChatMessage"("senderId", "clientId");

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_memberAId_fkey" FOREIGN KEY ("memberAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_memberBId_fkey" FOREIGN KEY ("memberBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
