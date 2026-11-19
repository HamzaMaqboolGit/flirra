CREATE TABLE "AdminStaff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "department" TEXT NOT NULL DEFAULT '',
    "staffRole" TEXT NOT NULL DEFAULT 'ADMIN',
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdminStaff_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AdminStaffInvitation" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminStaffInvitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdminStaff_userId_key" ON "AdminStaff"("userId");
CREATE UNIQUE INDEX "AdminStaffInvitation_tokenHash_key" ON "AdminStaffInvitation"("tokenHash");
CREATE INDEX "AdminStaffInvitation_staffId_expiresAt_idx" ON "AdminStaffInvitation"("staffId", "expiresAt");
ALTER TABLE "AdminStaff" ADD CONSTRAINT "AdminStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminStaffInvitation" ADD CONSTRAINT "AdminStaffInvitation_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "AdminStaff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
