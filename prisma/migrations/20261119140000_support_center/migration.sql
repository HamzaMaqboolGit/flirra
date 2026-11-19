ALTER TABLE "Conversation" ADD COLUMN "officialKey" TEXT;
CREATE UNIQUE INDEX "Conversation_officialKey_key" ON "Conversation"("officialKey");

CREATE TYPE "SupportRequestStatus" AS ENUM ('WAITING', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED');

CREATE TABLE "SupportFAQ" (
  "id" TEXT NOT NULL,
  "question" VARCHAR(200) NOT NULL,
  "answer" VARCHAR(4000) NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'General',
  "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "followUps" JSONB,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "escalate" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportFAQ_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupportFAQ_enabled_sortOrder_idx" ON "SupportFAQ"("enabled", "sortOrder");

CREATE TABLE "SupportAgent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "availability" TEXT NOT NULL DEFAULT 'OFFLINE',
  "maxChats" INTEGER NOT NULL DEFAULT 3,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportAgent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportAgent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SupportAgent_userId_key" ON "SupportAgent"("userId");

CREATE TABLE "SupportRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "status" "SupportRequestStatus" NOT NULL DEFAULT 'WAITING',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "assignedAgentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupportRequest_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupportRequest_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "SupportRequest_status_priority_createdAt_idx" ON "SupportRequest"("status", "priority", "createdAt");
CREATE INDEX "SupportRequest_userId_status_idx" ON "SupportRequest"("userId", "status");
CREATE UNIQUE INDEX "SupportRequest_one_active_per_user" ON "SupportRequest"("userId") WHERE "status" IN ('WAITING','ASSIGNED','IN_PROGRESS');

CREATE TABLE "SupportInternalNote" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "body" VARCHAR(2000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportInternalNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportInternalNote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SupportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupportInternalNote_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SupportInternalNote_requestId_createdAt_idx" ON "SupportInternalNote"("requestId", "createdAt");

CREATE TABLE "SupportRating" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "stars" INTEGER NOT NULL,
  "feedback" VARCHAR(1000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportRating_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportRating_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SupportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupportRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SupportRating_requestId_key" ON "SupportRating"("requestId");

INSERT INTO "SupportFAQ" ("id","question","answer","category","keywords","sortOrder","enabled","escalate","updatedAt") VALUES
('support-faq-account','Account & Profile','You can update your profile details, photos, and privacy options from Profile Settings. Contact support if you cannot access your account.','Account & Profile',ARRAY['account','profile','photos','settings'],0,true,false,CURRENT_TIMESTAMP),
('support-faq-coins','Coins & Payments','Coin purchases appear in your wallet after the payment provider confirms them. Check Wallet → Transaction History for the latest status.','Coins & Payments',ARRAY['coins','payment','purchase','wallet','refund'],1,true,false,CURRENT_TIMESTAMP),
('support-faq-calls','Video Calls','Allow camera and microphone access in your browser, then start a call from Discover or Random Call.','Video Calls',ARRAY['call','camera','microphone','video'],2,true,false,CURRENT_TIMESTAMP),
('support-faq-gifts','Gifts & Earnings','Gifts received during eligible calls appear in Gift Collection. Earnings are credited according to the current platform share settings.','Gifts & Earnings',ARRAY['gift','earnings','coins'],3,true,false,CURRENT_TIMESTAMP),
('support-faq-withdrawals','Withdrawals','Add your bank details in Profile → More Actions → Withdraw Earnings. Withdrawal requests are reviewed by the payout team.','Withdrawals',ARRAY['withdraw','bank','payout'],4,true,false,CURRENT_TIMESTAMP),
('support-faq-verification','Verification','Email verification controls the Verified badge and account email status. It is separate from payout setup.','Verification',ARRAY['email','verify','badge'],5,true,false,CURRENT_TIMESTAMP),
('support-faq-safety','Safety & Reporting','Use Report or Block in a profile or conversation to alert the safety team and stop unwanted contact.','Safety & Reporting',ARRAY['safety','report','block','abuse'],6,true,false,CURRENT_TIMESTAMP),
('support-faq-agent','Talk to Support Agent','I’ll connect you with a support agent.','Support',ARRAY['agent','human','support'],7,true,true,CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- The package catalog shows active packages only. The fourth seeded package was paused in the supplied state.
UPDATE "CoinPackage" SET "active"=true WHERE "name"='Noir' AND "active"=false;
