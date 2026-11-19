import { logout } from "@/lib/auth";
import { ok } from "@/lib/http";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { allDevices?: boolean } | null;
  if (body?.allDevices) {
    const user = await currentUser();
    if (user) await prisma.userSession.deleteMany({ where: { userId: user.id } });
  }
  await logout();
  return ok();
}
