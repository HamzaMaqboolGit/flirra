import { prisma } from "@/lib/db";
import { guard } from "@/lib/guard";
import { fail, ok } from "@/lib/http";

export async function GET() {
  const { user, error } = await guard(undefined, { allowSuspended: true });
  if (!user) return error;
  try {
    const [messages, missedCalls, other] = await Promise.all([
      prisma.chatMessage.count({
        where: { readAt: null, senderId: { not: user.id }, conversation: { OR: [{ memberAId: user.id }, { memberBId: user.id }] } },
      }),
      prisma.notification.count({ where: { userId: user.id, kind: "MISSED_CALL", readAt: null } }),
      prisma.notification.count({ where: { userId: user.id, readAt: null, kind: { notIn: ["DIRECT_MESSAGE", "INCOMING_CALL", "MISSED_CALL"] } } }),
    ]);
    return ok({ messages, missedCalls, other });
  } catch (cause) {
    console.error("[notifications/counts]", cause);
    return fail("Notification counts are temporarily unavailable.", 500);
  }
}

export async function PATCH(req: Request) {
  const { user, error } = await guard(undefined, { allowSuspended: true });
  if (!user) return error;
  const body = await req.json().catch(() => null) as { acknowledge?: unknown } | null;
  if (body?.acknowledge !== "MISSED_CALL" && body?.acknowledge !== "OTHER") return fail("Unsupported notification update.", 400);
  try {
    await prisma.notification.updateMany({ where: { userId: user.id, readAt: null, ...(body.acknowledge === "MISSED_CALL" ? { kind: "MISSED_CALL" } : { kind: { notIn: ["DIRECT_MESSAGE", "INCOMING_CALL", "MISSED_CALL"] } }) }, data: { readAt: new Date() } });
    return ok({ acknowledged: true });
  } catch (cause) {
    console.error("[notifications/acknowledge]", cause);
    return fail("Could not acknowledge missed calls.", 500);
  }
}
