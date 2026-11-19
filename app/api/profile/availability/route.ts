import { guard } from "@/lib/guard";
import { fail, ok } from "@/lib/http";
import { setAvailability } from "@/lib/matchmaking";
import { prisma } from "@/lib/db";
import { notifyPublicPresence } from "@/lib/calls";

export async function POST(req: Request) {
  const { user, error } = await guard(["MALE", "FEMALE"], { maintenance: true });
  if (!user) return error;
  const body = await req.json().catch(() => null) as { online?: boolean } | null;
  if (body?.online) {
    const profile = await prisma.userProfile.findUnique({ where: { userId: user.id }, select: { discoverable: true } });
    if (!profile?.discoverable) return fail("Turn on profile discovery before going online", 403);
  }
  await setAvailability(user.id, Boolean(body?.online));
  notifyPublicPresence();
  return ok({ online: Boolean(body?.online) });
}
