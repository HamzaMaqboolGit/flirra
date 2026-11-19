import { prisma } from "@/lib/db";
import { createUserSession, hashToken } from "@/lib/auth";
import { fail, ok } from "@/lib/http";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { token?: string; code?: string } | null;
  const token = body?.code?.trim() || body?.token?.trim();
  if (!token || (body?.code && !/^\d{6}$/.test(token))) return fail("Enter the 6-digit verification code");
  const row = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!row || row.expiresAt < new Date()) return fail("Verification link is invalid or expired");
  if (row.user.status === "BANNED" || row.user.status === "DELETED") return fail("This account cannot be activated", 403);
  if (row.pendingEmail) {
    const conflict = await prisma.user.findUnique({ where: { email: row.pendingEmail }, select: { id: true } });
    if (conflict && conflict.id !== row.userId) return fail("That email address is already in use");
  }
  await prisma.user.update({ where: { id: row.userId }, data: { ...(row.pendingEmail ? { email: row.pendingEmail } : {}), emailVerifiedAt: new Date() } });
  await prisma.emailVerificationToken.deleteMany({ where: { userId: row.userId } });
  if (row.user.role !== "ADMIN") await createUserSession(row.userId, row.user.role);
  return ok({ role: row.user.role });
}
