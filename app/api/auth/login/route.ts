import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { rateLimit } from "@/lib/redis";
import { clientIp } from "@/lib/utils";
import { loginSchema, zodError } from "@/lib/validators";
import { createUserSession, verifyPassword } from "@/lib/auth";

export async function POST(req: Request) {
  const parsed = loginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(zodError(parsed.error));
  const email = parsed.data.email.toLowerCase();
  try {
  if (!(await rateLimit(`login:${clientIp(req.headers.get("x-forwarded-for"))}:${email}`, 12, 900))) return fail("Too many sign-in attempts. Try again later.", 429);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) return fail("Email or password is incorrect", 401);
  if (user.role === "ADMIN") return fail("Use the administrator sign-in at /admin/login.", 403);
  if (user.status === "BANNED") return fail("This account is banned", 403);
  if (user.status === "DELETED") return fail("This account has been deleted", 403);
  if (user.deactivatedAt) {
    await prisma.user.update({ where: { id: user.id }, data: { deactivatedAt: null } });
    const profile = await prisma.userProfile.findUnique({ where: { userId: user.id }, select: { accountSettings: true } });
    const preferences = profile?.accountSettings && typeof profile.accountSettings === 'object' ? profile.accountSettings as Record<string, unknown> : {};
    await prisma.userProfile.updateMany({ where: { userId: user.id }, data: { discoverable: preferences.publicProfile !== false } });
  }
  await createUserSession(user.id, user.role);
  // Email verification is a separate step from signing in. Keep the stored
  // verification timestamp untouched; downstream discovery and call routes
  // continue to require it before a member can be presented as verified.
  return ok({ role: user.role, status: user.status, emailVerified: Boolean(user.emailVerifiedAt) });
  } catch (error) {
    console.error("[login]", error);
    return fail("Sign-in is temporarily unavailable. Please try again shortly.", 503);
  }
}
