import { prisma } from "@/lib/db";
import { prepareAdminSession, verifyPassword } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { rateLimit } from "@/lib/redis";
import { clientIp } from "@/lib/utils";
import { loginSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Enter your administrator email and password.");
  const email = parsed.data.email.toLowerCase();

  try {
    if (!(await rateLimit(`admin-login:${clientIp(request.headers.get("x-forwarded-for"))}:${email}`, 8, 900))) {
      return fail("Too many sign-in attempts. Try again later.", 429);
    }
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true, status: true, passwordHash: true, deactivatedAt: true, isGuest: true },
    });
    if (!user || user.role !== "ADMIN" || user.isGuest || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return fail("Administrator email or password is incorrect.", 401);
    }
    if (user.status !== "ACTIVE" || user.deactivatedAt) {
      return fail("This administrator account is unavailable.", 403);
    }

    const session = await prepareAdminSession(user.id);
    const allowed = await prisma.$transaction(async (tx) => {
      const staff = await tx.adminStaff.findUnique({ where: { userId: user.id }, select: { id: true } });
      if (staff) {
        const active = await tx.adminStaff.updateMany({
          where: { id: staff.id, enabled: true },
          data: { lastLoginAt: new Date() },
        });
        if (!active.count) return false;
      }
      await tx.userSession.create({ data: session.data });
      await tx.adminAuditLog.create({ data: { adminId: user.id, action: "admin.login" } });
      return true;
    });
    if (!allowed) return fail("This administrator account is unavailable.", 403);

    await session.setCookie();
    return ok({ authenticated: true });
  } catch (error) {
    console.error("[admin:login]", error);
    return fail("Administrator sign-in is temporarily unavailable. Please try again.", 503);
  }
}
