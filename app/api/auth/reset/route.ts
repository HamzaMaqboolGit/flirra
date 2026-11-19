import { prisma } from "@/lib/db";
import { hashPassword, hashToken } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { passwordSchema } from "@/lib/validators";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { token?: string; password?: string } | null;
  const password = passwordSchema.safeParse(body?.password);
  if (!body?.token || !password.success) return fail(password.success ? "Reset link is invalid" : password.error.issues[0]?.message || "Choose a stronger password");
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(body.token) } });
  if (!row || row.expiresAt < new Date()) return fail("Reset link is invalid or expired");
  await prisma.user.update({ where: { id: row.userId }, data: { passwordHash: await hashPassword(password.data) } });
  await prisma.passwordResetToken.deleteMany({ where: { userId: row.userId } });
  await prisma.userSession.deleteMany({ where: { userId: row.userId } });
  return ok();
}
