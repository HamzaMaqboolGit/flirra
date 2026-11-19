import { prisma } from "@/lib/db";
import { guard } from "@/lib/guard";
import { fail, ok } from "@/lib/http";
import { ensureOfficialConversations } from "@/lib/support";

function pair(a: string, b: string) { return a < b ? [a, b] as const : [b, a] as const; }

export async function GET(req: Request) {
  const { user, error } = await guard(undefined, { allowSuspended: true });
  if (!user) return error;
  await ensureOfficialConversations(user.id);
  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 80);
  try {
  const rows = await prisma.conversation.findMany({
    where: { AND: [ { OR: [{ memberAId: user.id }, { memberBId: user.id }] }, ...(q ? [{ OR: [
      { memberA: { displayName: { contains: q, mode: "insensitive" as const } } },
      { memberB: { displayName: { contains: q, mode: "insensitive" as const } } },
    ] }] : []) ] },
    orderBy: [{ officialKey: "asc" }, { updatedAt: "desc" }], take: 100,
    include: { memberA: { select: { id: true, displayName: true, status: true, role: true, dateOfBirth: true, profile: { select: { country: true, avatarUrl: true, interests: true, online: true, lastSeenAt: true } } } }, memberB: { select: { id: true, displayName: true, status: true, role: true, dateOfBirth: true, profile: { select: { country: true, avatarUrl: true, interests: true, online: true, lastSeenAt: true } } } }, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const ids = rows.map(row => row.memberAId === user.id ? row.memberBId : row.memberAId);
  const blocks = ids.length ? await prisma.blockedUser.findMany({ where: { OR: [{ blockerId: user.id, blockedId: { in: ids } }, { blockedId: user.id, blockerId: { in: ids } }] }, select: { blockerId: true, blockedId: true } }) : [];
  const blocked = new Set(blocks.map(row => row.blockerId === user.id ? row.blockedId : row.blockerId));
  const now = Date.now();
  const visible = rows.filter(row => {
    const other = row.memberAId === user.id ? row.memberB : row.memberA;
    return other.status === "ACTIVE" && !blocked.has(other.id);
  });
  const conversations = await Promise.all(visible.map(async row => {
    const other = row.memberAId === user.id ? row.memberB : row.memberA;
    const last = row.messages[0];
    const unread = await prisma.chatMessage.count({ where: { conversationId: row.id, senderId: other.id, readAt: null } });
    return { id: row.id, officialKey: row.officialKey, partner: { id: other.id, displayName: other.displayName, age: other.dateOfBirth ? Math.max(18, Math.floor((now - other.dateOfBirth.getTime()) / 31_557_600_000)) : null, role: other.role, country: other.profile?.country || "", interests: other.profile?.interests || [], avatarUrl: other.profile?.avatarUrl || null, online: Boolean(other.profile?.online && other.profile.lastSeenAt && other.profile.lastSeenAt.getTime() > now - 90_000) }, lastMessage: last ? { id: last.id, senderId: last.senderId, body: last.body, createdAt: last.createdAt, deliveredAt: last.deliveredAt, readAt: last.readAt } : null, unread };
  }));
  conversations.sort((a:any,b:any)=>{const aOfficial=rows.find(row=>row.id===a.id)?.officialKey;const bOfficial=rows.find(row=>row.id===b.id)?.officialKey;return (aOfficial?0:1)-(bOfficial?0:1)||(aOfficial||"").localeCompare(bOfficial||"")});
  return ok({ conversations });
  } catch (cause) {
    console.error("[messages/list]", cause);
    return fail("Messages are temporarily unavailable. Please try again.", 500);
  }
}

export async function POST(req: Request) {
  const { user, error } = await guard(undefined, { maintenance: true });
  if (!user) return error;
  const body = await req.json().catch(() => null) as { userId?: unknown } | null;
  if (typeof body?.userId !== "string" || !body.userId) return fail("Choose a member to message");
  if (body.userId === user.id) return fail("You cannot start a conversation with yourself", 400);
  const otherId = body.userId;
  const [a, b] = pair(user.id, otherId);
  const [other, block, sharedCall] = await Promise.all([
    prisma.user.findFirst({ where: { id: otherId, status: "ACTIVE", isGuest: false }, select: { id: true, profile: { select: { accountSettings: true } } } }),
    prisma.blockedUser.findFirst({ where: { OR: [{ blockerId: user.id, blockedId: otherId }, { blockerId: otherId, blockedId: user.id }] }, select: { blockerId: true } }),
    prisma.videoCall.findFirst({ where: { OR: [{ callerId: user.id, recipientId: otherId }, { callerId: otherId, recipientId: user.id }], status: { in: ["ACTIVE", "COMPLETED"] }, startedAt: { not: null } }, select: { id: true } }),
  ]);
  if (!other || block || !sharedCall) return fail("This conversation is unavailable", 404);
  const recipientPrefs = other.profile?.accountSettings;
  if (recipientPrefs && typeof recipientPrefs === 'object' && (recipientPrefs as Record<string, unknown>).allowMessages === false) return fail("This member is not accepting new messages", 403);
  const conversation = await prisma.conversation.upsert({ where: { memberAId_memberBId: { memberAId: a, memberBId: b } }, create: { memberAId: a, memberBId: b }, update: {} });
  return ok({ conversationId: conversation.id });
}
