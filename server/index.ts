import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import next from "next";
import { parse } from "node:url";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { prisma } from "../lib/db";
import { redis } from "../lib/redis";
import { readCookie, userFromToken } from "../lib/auth";
import { acceptCall, endCall, liveCallFor, setEmitter, setPublicPresenceEmitter, notifyPublicPresence } from "../lib/calls";
import { dequeue, recoverAfterBoot, setAvailability, sweep, tryMatch } from "../lib/matchmaking";
import { hashPassword } from "../lib/auth";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function ensureAdmin() {
  const configuredEmail = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!configuredEmail && !password) return;
  if (!configuredEmail || !password || password.length < 14) throw new Error("Set ADMIN_EMAIL and an ADMIN_PASSWORD with at least 14 characters");
  const email = configuredEmail.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        displayName: "Velora Admin",
        dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
        role: "ADMIN",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
        profile: { create: { country: "United States", bio: "Platform administrator" } },
        wallet: { create: {} },
      },
    });
    console.log(`[admin] created ${email}`);
  }
}

async function ensureSeedData() {
  // Numeric pricing and rewards are configured explicitly in the admin panel.
}

const server = createServer((req, res) => {
  handle(req, res, parse(req.url || "/", true));
});

const allowedOrigins = [process.env.APP_URL || "http://localhost:3000", ...(dev ? ["http://localhost:3100", "http://127.0.0.1:3100"] : [])];
const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true },
});
const publicIo = io.of('/public');
async function onlineMembersCount() {
  return prisma.user.count({ where: { role: { in: ['MALE','FEMALE'] }, status: 'ACTIVE', isGuest: false, emailVerifiedAt: { not: null }, profile: { online: true, discoverable: true, lastSeenAt: { gt: new Date(Date.now() - 90_000) } }, sentCalls: { none: { status: { in: ['RINGING','ACTIVE'] } } }, receivedCalls: { none: { status: { in: ['RINGING','ACTIVE'] } } } } });
}
async function publishOnlineMembers() {
  try { publicIo.emit('presence:members-online', { count: await onlineMembersCount() }); } catch (error) { console.error('[public-presence]', error); }
}
setPublicPresenceEmitter(() => { void publishOnlineMembers(); });
publicIo.on('connection', socket => { void onlineMembersCount().then(count => socket.emit('presence:members-online', { count })).catch(() => socket.emit('presence:unavailable')); });
const pub = redis().duplicate();
const sub = redis().duplicate();
io.adapter(createAdapter(pub, sub));
setEmitter((userId, event, payload) => io.to(`user:${userId}`).emit(event, payload));

const grace = new Map<string, NodeJS.Timeout>();
type TypingPresence = { userId: string; recipientId: string; event: 'message:typing' | 'call:typing'; keyField: 'conversationId' | 'callId'; key: string; sockets: Map<string, NodeJS.Timeout> };
const typingPresence = new Map<string, TypingPresence>();
function updateTypingPresence(socketId: string, userId: string, recipientId: string, event: TypingPresence['event'], keyField: TypingPresence['keyField'], key: string, typing: boolean) {
  const presenceKey = `${event}:${keyField}:${key}:${userId}`;
  let presence = typingPresence.get(presenceKey);
  if (typing) {
    const first = !presence;
    if (!presence) { presence = { userId, recipientId, event, keyField, key, sockets: new Map() }; typingPresence.set(presenceKey, presence); }
    const oldTimer = presence.sockets.get(socketId);
    if (oldTimer) clearTimeout(oldTimer);
    const timer = setTimeout(() => updateTypingPresence(socketId, userId, recipientId, event, keyField, key, false), 5_000);
    presence.sockets.set(socketId, timer);
    if (first) io.to(`user:${recipientId}`).emit(event, { [keyField]: key, userId, typing: true });
  } else if (presence) {
    const timer = presence.sockets.get(socketId);
    if (timer) clearTimeout(timer);
    presence.sockets.delete(socketId);
    if (!presence.sockets.size) {
      typingPresence.delete(presenceKey);
      io.to(`user:${recipientId}`).emit(event, { [keyField]: key, userId, typing: false });
    }
  }
}
function clearSocketTyping(socketId: string) {
  for (const presence of [...typingPresence.values()]) updateTypingPresence(socketId, presence.userId, presence.recipientId, presence.event, presence.keyField, presence.key, false);
}

io.use(async (socket, nextFn) => {
  try {
    const token = readCookie(socket.handshake.headers.cookie);
    const user = await userFromToken(token);
    if (!user) return nextFn(new Error("unauthorized"));
    socket.data.userId = user.id;
    socket.data.role = user.role;
    nextFn();
  } catch (error) {
    nextFn(error instanceof Error ? error : new Error("unauthorized"));
  }
});

io.on("connection", async (socket) => {
  const userId = socket.data.userId as string;
  socket.join(`user:${userId}`);

  socket.on("presence:heartbeat", async () => {
    await prisma.userProfile.update({ where: { userId }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  });

  socket.on("presence:online", async ({ online }: { online: boolean }) => {
    if (socket.data.role !== "FEMALE" && socket.data.role !== "MALE") return;
    await setAvailability(userId, Boolean(online));
    notifyPublicPresence();
  });

  socket.on("call:accept", async ({ callId }: { callId: string }) => {
    try { await acceptCall(callId, userId); } catch (error) { socket.emit("call:error", { error: error instanceof Error ? error.message : "Unable to accept" }); }
  });
  socket.on("call:reject", async ({ callId }: { callId: string }) => {
    const call = await prisma.videoCall.findUnique({ where: { id: callId } });
    if (call?.recipientId === userId && call.status === "RINGING") { await endCall(callId, "rejected"); socket.emit("call:rejected", { callId }); }
  });
  socket.on("call:end", async ({ callId }: { callId: string }) => {
    const call = await prisma.videoCall.findUnique({ where: { id: callId } });
    if (call && (call.callerId === userId || call.recipientId === userId)) {
      if (call.callerId === userId) await dequeue(userId);
      await endCall(callId, "hangup", userId);
    }
  });

  socket.on("call:chat", async ({ callId, text, clientId }: { callId?: unknown; text?: unknown; clientId?: unknown }, acknowledge?: (result: { delivered: boolean }) => void) => {
    if (typeof callId !== "string" || typeof text !== "string") { acknowledge?.({ delivered: false }); return; }
    const message = text.trim();
    if (!message || message.length > 500) { acknowledge?.({ delivered: false }); return; }
    const call = await prisma.videoCall.findUnique({ where: { id: callId }, include: { participants: { select: { userId: true, consentedAt: true, leftAt: true } } } });
    if (!call || call.status !== "ACTIVE" || (call.callerId !== userId && call.recipientId !== userId)) { acknowledge?.({ delivered: false }); return; }
    if (call.participants.length !== 2 || call.participants.some((participant) => !participant.consentedAt || participant.leftAt)) { acknowledge?.({ delivered: false }); return; }
    const recipientId = call.callerId === userId ? call.recipientId : call.callerId;
    const id = typeof clientId === "string" && clientId.length <= 80 ? clientId : randomUUID();
    const createdAt = new Date().toISOString();
    io.to(`user:${recipientId}`).emit("call:chat", { callId, message: { id, senderId: userId, text: message, createdAt } });
    io.to(`user:${recipientId}`).emit("message:new", { conversationId: `call:${callId}`, message: { id, senderId: userId, body: message, createdAt } });
    acknowledge?.({ delivered: true });
  });

  socket.on("call:typing", async ({ callId, typing }: { callId?: unknown; typing?: unknown }) => {
    if (typeof callId !== "string") return;
    const call = await prisma.videoCall.findUnique({ where: { id: callId }, include: { participants: { select: { userId: true, consentedAt: true, leftAt: true } } } });
    if (!call || call.status !== "ACTIVE" || (call.callerId !== userId && call.recipientId !== userId)) return;
    if (call.participants.length !== 2 || call.participants.some((participant) => !participant.consentedAt || participant.leftAt)) return;
    const recipientId = call.callerId === userId ? call.recipientId : call.callerId;
    updateTypingPresence(socket.id, userId, recipientId, 'call:typing', 'callId', callId, Boolean(typing));
  });

  socket.on("message:typing", async ({ conversationId, typing }: { conversationId?: unknown; typing?: unknown }) => {
    if (typeof conversationId !== "string") return;
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { memberAId: true, memberBId: true } });
    if (!conversation || (conversation.memberAId !== userId && conversation.memberBId !== userId)) return;
    const otherId = conversation.memberAId === userId ? conversation.memberBId : conversation.memberAId;
    const block = await prisma.blockedUser.findFirst({ where: { OR: [{ blockerId: userId, blockedId: otherId }, { blockerId: otherId, blockedId: userId }] }, select: { blockerId: true } });
    if (!block) updateTypingPresence(socket.id, userId, otherId, 'message:typing', 'conversationId', conversationId, Boolean(typing));
  });

  socket.on("message:delivered", async ({ conversationId, messageIds }: { conversationId?: unknown; messageIds?: unknown }) => {
    if (typeof conversationId !== "string" || !Array.isArray(messageIds) || messageIds.length > 50 || !messageIds.every(id => typeof id === "string")) return;
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { memberAId: true, memberBId: true } });
    if (!conversation || (conversation.memberAId !== userId && conversation.memberBId !== userId)) return;
    const otherId = conversation.memberAId === userId ? conversation.memberBId : conversation.memberAId;
    const block = await prisma.blockedUser.findFirst({ where: { OR: [{ blockerId: userId, blockedId: otherId }, { blockerId: otherId, blockedId: userId }] }, select: { blockerId: true } });
    if (block) return;
    const deliveredAt = new Date();
    const result = await prisma.chatMessage.updateMany({ where: { id: { in: messageIds as string[] }, conversationId, senderId: otherId, deliveredAt: null }, data: { deliveredAt } });
    if (result.count) io.to(`user:${otherId}`).emit("message:delivered", { conversationId, messageIds, deliveredAt: deliveredAt.toISOString() });
  });

  socket.on("admin:disconnect-user", async ({ targetId }: { targetId: string }) => {
    if (socket.data.role !== "ADMIN" || typeof targetId !== "string") return;
    await setAvailability(targetId, false).catch(() => undefined);
    await dequeue(targetId);
    const call = await liveCallFor(targetId);
    if (call) await endCall(call.id, "admin_terminate");
    io.in(`user:${targetId}`).disconnectSockets(true);
  });

  socket.on("webrtc:ready", async ({ callId }: { callId: string }, acknowledge?: (result: { ok: boolean; ready?: number; error?: string }) => void) => {
    const call = await liveCallFor(userId);
    if (!call || call.id !== callId || call.status !== "ACTIVE") { acknowledge?.({ ok: false, error: "No accepted call is active" }); return; }
    const participant = await prisma.callParticipant.findFirst({ where: { callId, userId } });
    if (!participant?.consentedAt) { acknowledge?.({ ok: false, error: "Call consent is required" }); return; }
    await redis().sadd(`ready:${callId}`, userId);
    await redis().expire(`ready:${callId}`, 60 * 30);
    await prisma.callParticipant.updateMany({ where: { callId, userId }, data: { joinedAt: new Date() } });
    const ready = await redis().scard(`ready:${callId}`);
    acknowledge?.({ ok: true, ready });
    if (ready >= 2) {
      const { billMinute } = await import("../lib/billing");
      const started = await billMinute(callId, 1, true);
      if (!started.ok) { await endCall(callId, "insufficient_balance"); return; }
      const active = await liveCallFor(call.callerId);
      const { serializeCall } = await import("../lib/calls");
      const [maleWallet, femaleWallet] = await Promise.all([
        prisma.wallet.findUnique({ where: { userId: call.callerId } }),
        prisma.wallet.findUnique({ where: { userId: call.recipientId } }),
      ]);
      io.to(`user:${call.callerId}`).emit("wallet:update", { wallet: maleWallet });
      io.to(`user:${call.recipientId}`).emit("wallet:update", { wallet: femaleWallet });
      io.to(`user:${call.callerId}`).emit("call:active", { call: active ? serializeCall(active, call.callerId) : null });
      io.to(`user:${call.recipientId}`).emit("call:active", { call: active ? serializeCall(active, call.recipientId) : null });
      io.to(`user:${call.callerId}`).emit("webrtc:start", { callId });
    }
  });

  socket.on("webrtc:signal", async ({ callId, data }: { callId: string; data: unknown }) => {
    const call = await prisma.videoCall.findUnique({ where: { id: callId } });
    if (!call || call.status !== "ACTIVE") return;
    if (call.callerId !== userId && call.recipientId !== userId) return;
    const other = call.callerId === userId ? call.recipientId : call.callerId;
    io.to(`user:${other}`).emit("webrtc:signal", { callId, data });
  });

  socket.on("disconnect", async () => {
    clearSocketTyping(socket.id);
    const left = await redis().decr(`conn:${userId}`);
    if (left > 0) return;
    await redis().del(`conn:${userId}`);
    grace.set(userId, setTimeout(async () => {
      grace.delete(userId);
      await setAvailability(userId, false).catch(() => undefined);
      notifyPublicPresence();
      await dequeue(userId);
      const call = await liveCallFor(userId);
      if (call) await endCall(call.id, "disconnect", userId);
    }, 12_000));
  });

  // Register all event handlers before awaiting Redis/DB work so a fast client
  // cannot emit its first event during an unhandled connection setup window.
  const connections = await redis().incr(`conn:${userId}`);
  if (connections === 1) await redis().expire(`conn:${userId}`, 60 * 60 * 12);
  const pending = grace.get(userId);
  if (pending) clearTimeout(pending);
  grace.delete(userId);
  await prisma.userProfile.update({ where: { userId }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
});

setInterval(() => { sweep().then(() => tryMatch()).catch((error) => console.error("[sweep]", error)); }, 5000);
setInterval(() => { void publishOnlineMembers(); }, 30_000);

async function bootstrap() {
  await app.prepare();
  await ensureAdmin();
  await ensureSeedData();
  await recoverAfterBoot();
  server.listen(port, hostname, () => {
    console.log(`Velora ready on http://localhost:${port}`);
  });
}

bootstrap().catch((error) => {
  console.error("[startup] Velora could not start", error);
  process.exitCode = 1;
});
