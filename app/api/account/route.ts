import { randomBytes } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { logout } from "@/lib/auth";
import { guard } from "@/lib/guard";
import { fail, ok } from "@/lib/http";
import { invalidatePublicStats } from "@/lib/public-stats";
import { notifyPublicPresence } from "@/lib/calls";
import { verifyPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/redis";
import { clientIp } from "@/lib/utils";

export async function DELETE(req: Request) {
  const { user, error } = await guard(undefined, { allowSuspended: true });
  if (!user) return error;
  if (user.role === "ADMIN") return fail("Administrator accounts are removed from the server configuration", 403);
  if (!(await rateLimit(`account-delete:${user.id}:${clientIp(req.headers.get('x-forwarded-for'))}`, 4, 3600))) return fail("Too many deletion attempts. Try again later.", 429);
  const body = await req.json().catch(() => null) as { password?: unknown } | null;
  if (typeof body?.password !== "string" || !body.password || !(await verifyPassword(body.password, user.passwordHash))) return fail("Enter your current password to confirm account deletion", 401);
  if (user.profile?.avatarUrl?.startsWith("/uploads/")) {
    await unlink(path.join(process.cwd(), "public", user.profile.avatarUrl)).catch(() => undefined);
  }
  await prisma.$transaction([
    prisma.userSession.deleteMany({ where: { userId: user.id } }),
    prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    prisma.userProfile.update({ where: { userId: user.id }, data: { bio: "", interests: [], avatarUrl: null, online: false, country: "" } }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        status: "DELETED",
        deletedAt: new Date(),
        displayName: "Deleted member",
        email: `deleted+${user.id}@invalid.local`,
        passwordHash: randomBytes(32).toString("hex"),
      },
    }),
  ]);
  invalidatePublicStats();
  notifyPublicPresence();
  await logout();
  return ok();
}
