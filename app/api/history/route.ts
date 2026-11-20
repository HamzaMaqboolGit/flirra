import { prisma } from "@/lib/db";
import { guard } from "@/lib/guard";
import { fail, ok } from "@/lib/http";

const PAGE_SIZE = 20;

export async function GET(req: Request) {
  const { user, error } = await guard(undefined, { allowSuspended: true });
  if (!user) return error;

  const params = new URL(req.url).searchParams;
  const filter = ["all", "incoming", "outgoing", "missed"].includes(params.get("type") || "") ? params.get("type")! : "all";
  const query = (params.get("q") || "").trim().slice(0, 80);
  const period = params.get("period") || "all";
  const page = Math.max(1, Math.min(1000, Number.parseInt(params.get("page") || "1", 10) || 1));
  const since = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : period === "year" ? 365 : null;
  const dateFilter = since ? { gte: new Date(Date.now() - since * 86_400_000) } : undefined;
  const base = { OR: [
    { callerId: user.id, hiddenForCaller: false },
    { recipientId: user.id, hiddenForRecipient: false },
  ] };
  const missedCall = { recipientId: user.id, endReason: "ring_timeout" };
  const direction = filter === "incoming" ? { recipientId: user.id } : filter === "outgoing" ? { callerId: user.id } : filter === "missed" ? missedCall : {};
  const where = {
    AND: [base, direction, dateFilter ? { createdAt: dateFilter } : {}, query ? { OR: [
      { caller: { displayName: { contains: query } } },
      { recipient: { displayName: { contains: query } } },
    ] } : {}],
  };
  try {
  const [calls, total, counts] = await Promise.all([
    prisma.videoCall.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: {
      caller: { select: { id: true, displayName: true, role: true, dateOfBirth: true, status: true, profile: { select: { country: true, avatarUrl: true, online: true, lastSeenAt: true } } } },
      recipient: { select: { id: true, displayName: true, role: true, dateOfBirth: true, status: true, profile: { select: { country: true, avatarUrl: true, online: true, lastSeenAt: true } } } },
    } }),
    prisma.videoCall.count({ where }),
    Promise.all([
      prisma.videoCall.count({ where: base }),
      prisma.videoCall.count({ where: { AND: [base, { recipientId: user.id }] } }),
      prisma.videoCall.count({ where: { AND: [base, { callerId: user.id }] } }),
      prisma.videoCall.count({ where: { AND: [base, missedCall] } }),
    ]),
  ]);

  const otherIds = calls.map(call => call.callerId === user.id ? call.recipientId : call.callerId);
  const blocks = otherIds.length ? await prisma.blockedUser.findMany({ where: { OR: [
    { blockerId: user.id, blockedId: { in: otherIds } },
    { blockedId: user.id, blockerId: { in: otherIds } },
  ] }, select: { blockerId: true, blockedId: true } }) : [];
  const blockedIds = new Set(blocks.map(row => row.blockerId === user.id ? row.blockedId : row.blockerId));
  const now = Date.now();
  return ok({
    calls: calls.map(call => {
      const outgoing = call.callerId === user.id;
      const person = outgoing ? call.recipient : call.caller;
      const hidden = person.status !== "ACTIVE" || blockedIds.has(person.id);
      const age = person.dateOfBirth ? Math.max(18, Math.floor((now - person.dateOfBirth.getTime()) / 31_557_600_000)) : null;
      const missed = !outgoing && call.endReason === "ring_timeout";
      const online = !hidden && Boolean(person.profile?.online && person.profile.lastSeenAt && person.profile.lastSeenAt.getTime() > now - 90_000);
      return {
        id: call.id,
        partner: hidden ? { id: person.id, displayName: "Unavailable member", age: null, country: "", avatarUrl: null, online: false, blocked: blockedIds.has(person.id) } : { id: person.id, displayName: person.displayName, age, country: person.profile?.country || "", avatarUrl: person.profile?.avatarUrl || null, online, blocked: false },
        direction: outgoing ? "outgoing" : "incoming",
        missed,
        status: call.status,
        createdAt: call.createdAt,
        startedAt: call.startedAt,
        endedAt: call.endedAt,
        durationSeconds: call.billableSeconds,
        endReason: call.endReason,
      };
    }),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    counts: { all: counts[0], incoming: counts[1], outgoing: counts[2], missed: counts[3] },
  });
  } catch (cause) {
    console.error("[history/list]", cause);
    return fail("Call history is temporarily unavailable. Please try again.", 500);
  }
}
