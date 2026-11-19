import { prisma } from "@/lib/db";
import { devLinksAllowed, hashToken, randomToken } from "@/lib/auth";
import { sendEmail, resetEmail } from "@/lib/email";
import { ok, fail } from "@/lib/http";
import { rateLimit } from "@/lib/redis";
import { clientIp } from "@/lib/utils";
import { safeInternalPath } from "@/lib/redirect";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { email?: string; next?: string } | null;
  const email = body?.email?.toLowerCase().trim() || "";
  if (!(await rateLimit(`forgot:${clientIp(req.headers.get("x-forwarded-for"))}`, 8, 3600))) return fail("Too many reset requests", 429);
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (!user || user.status === "DELETED" || user.status === "BANNED") return ok();
  const token = randomToken();
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
  await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3_600_000) } });
  const url = `${process.env.APP_URL || "http://localhost:3000"}/reset-password?token=${token}&next=${encodeURIComponent(safeInternalPath(body?.next))}`;
  const message = resetEmail(user.displayName, url);
  await sendEmail(user.email, message.subject, message.html);
  return ok({ devResetUrl: (await devLinksAllowed()) ? url : undefined });
}
