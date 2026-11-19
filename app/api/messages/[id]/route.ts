import { z } from "zod";
import { prisma } from "@/lib/db";
import { emitTo } from "@/lib/calls";
import { guard } from "@/lib/guard";
import { fail, ok } from "@/lib/http";
import { rateLimit } from "@/lib/redis";
import { clientIp } from "@/lib/utils";

type Params = { params: Promise<{ id: string }> };
const sendSchema = z.object({ body: z.string().trim().min(1).max(2000), clientId: z.string().uuid() });

async function authorized(id: string, userId: string) {
  const conversation = await prisma.conversation.findUnique({ where: { id }, include: {
    memberA: { select: { id: true, displayName: true, status: true, role: true, dateOfBirth: true, profile: { select: { country: true, avatarUrl: true, interests: true, online: true, lastSeenAt: true, accountSettings: true } } } },
    memberB: { select: { id: true, displayName: true, status: true, role: true, dateOfBirth: true, profile: { select: { country: true, avatarUrl: true, interests: true, online: true, lastSeenAt: true, accountSettings: true } } } },
  } });
  if (!conversation || (conversation.memberAId !== userId && conversation.memberBId !== userId)) return null;
  const other = conversation.memberAId === userId ? conversation.memberB : conversation.memberA;
  if (other.status !== "ACTIVE") return null;
  const blocked = await prisma.blockedUser.findFirst({ where: { OR: [{ blockerId: userId, blockedId: other.id }, { blockerId: other.id, blockedId: userId }] }, select: { blockerId: true } });
  if (blocked) return null;
  return { conversation, other };
}

export async function GET(req: Request, { params }: Params) {
  const { user, error } = await guard(undefined, { allowSuspended: true });
  if (!user) return error;
  const { id } = await params;
  const access = await authorized(id, user.id);
  if (!access) return fail("Conversation not found", 404);
  const url = new URL(req.url);
  const before = url.searchParams.get("before");
  const cursor = before ? new Date(before) : undefined;
  const validCursor = cursor && !Number.isNaN(cursor.getTime()) ? cursor : undefined;
  try {
  const rows = await prisma.chatMessage.findMany({ where: { conversationId: id, ...(validCursor ? { createdAt: { lt: validCursor } } : {}) }, orderBy: { createdAt: "desc" }, take: 50 });
  const messages = rows.reverse();
  const unreadRows = await prisma.chatMessage.findMany({ where: { conversationId: id, senderId: access.other.id, readAt: null }, select: { id: true }, take: 1000 });
  const unreadIds = unreadRows.map(message => message.id);
  if (unreadIds.length) {
    const readAt = new Date();
    await prisma.chatMessage.updateMany({ where: { id: { in: unreadIds }, readAt: null }, data: { readAt } });
    emitTo(access.other.id, "message:read", { conversationId: id, messageIds: unreadIds, readAt: readAt.toISOString() });
  }
  const [activeCall, gifts] = await Promise.all([
    prisma.videoCall.findFirst({ where: { status: "ACTIVE", OR: [{ callerId: user.id, recipientId: access.other.id }, { callerId: access.other.id, recipientId: user.id }] }, select: { id: true } }),
    prisma.callGift.findMany({ where: { OR: [{ conversationId: id }, { senderId: user.id, recipientId: access.other.id, call: { OR: [{ callerId: user.id, recipientId: access.other.id }, { callerId: access.other.id, recipientId: user.id }] } }, { senderId: access.other.id, recipientId: user.id, call: { OR: [{ callerId: user.id, recipientId: access.other.id }, { callerId: access.other.id, recipientId: user.id }] } }] }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, name: true, coins: true, senderId: true, createdAt: true, gift: { select: { imageUrl: true } } } }),
  ]);
  const now = Date.now();
  return ok({ conversationId: id, partner: { id: access.other.id, displayName: access.other.displayName, age: access.other.dateOfBirth ? Math.max(18, Math.floor((now - access.other.dateOfBirth.getTime()) / 31_557_600_000)) : null, role: access.other.role, country: access.other.profile?.country || "", interests: access.other.profile?.interests || [], avatarUrl: access.other.profile?.avatarUrl || null, online: Boolean(access.other.profile?.online && access.other.profile.lastSeenAt && access.other.profile.lastSeenAt.getTime() > now - 90_000) }, messages, gifts: gifts.reverse(), activeCallId: activeCall?.id || null, hasMore: rows.length === 50 });
  } catch (cause) {
    console.error('[messages/conversation]', { conversationId: id, userId: user.id, error: cause instanceof Error ? cause.message : 'unknown error' });
    return fail('Messages are temporarily unavailable. Please try again.', 500);
  }
}

export async function POST(req: Request, { params }: Params) {
  const { user, error } = await guard(undefined, { maintenance: true });
  if (!user) return error;
  const { id } = await params;
  const access = await authorized(id, user.id);
  if (!access) return fail("Conversation not found", 404);
  const messagePrefs = access.other.profile?.accountSettings;
  if (messagePrefs && typeof messagePrefs === 'object' && (messagePrefs as Record<string, unknown>).allowMessages === false) return fail("This member is not accepting messages", 403);
  const input = sendSchema.safeParse(await req.json().catch(() => null));
  if (!input.success) return fail(input.error.issues[0]?.message || "Enter a message");
  const duplicate = await prisma.chatMessage.findUnique({ where: { senderId_clientId: { senderId: user.id, clientId: input.data.clientId } } });
  if (duplicate) return ok({ message: duplicate, duplicate: true });
  if (!(await rateLimit(`dm:${user.id}:${clientIp(req.headers.get("x-forwarded-for"))}`, 40, 60))) return fail("You’re sending messages too quickly", 429);
  const message = await prisma.$transaction(async tx => {
    if (access.conversation.officialKey?.startsWith('support:')) {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
      const activeSupport = await tx.supportRequest.findFirst({ where: { userId: user.id, status: { in: ['WAITING', 'ASSIGNED', 'IN_PROGRESS'] } }, select: { id: true } });
      if (!activeSupport) await tx.supportRequest.create({ data: { userId: user.id, conversationId: id, status: 'WAITING' } });
    }
    const created = await tx.chatMessage.create({ data: { conversationId: id, senderId: user.id, clientId: input.data.clientId, body: input.data.body } });
    await tx.conversation.update({ where: { id }, data: { updatedAt: new Date() } });
    await tx.notification.create({ data: { userId: access.other.id, kind: "DIRECT_MESSAGE", payload: { conversationId: id, messageId: created.id, from: user.displayName } } });
    return created;
  });
  emitTo(access.other.id, "message:new", { conversationId: id, message });
  emitTo(access.other.id, "notification:new", { id: message.id, kind: "DIRECT_MESSAGE", conversationId: id });
  emitTo(user.id, "message:new", { conversationId: id, message });
  return ok({ message }, 201);
}
