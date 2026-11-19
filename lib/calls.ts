import type { CallStatus } from "@prisma/client";
import { prisma } from "./db";
import { redis } from "./redis";
import { settleCallEarningsInTransaction } from "./billing";
import { publicProfile } from "./auth";
import { invalidatePublicStats } from "./public-stats";
import { canInitiateCall, canReceiveCall, canStartWithBalance } from "./matching-rules";
import { bothCallParticipantsConsented } from "./call-consent";
import { callDurationSeconds, terminalCallStatus } from "./call-outcome";

type Emit = (userId: string, event: string, payload: unknown) => void;
// The Next.js route bundle and the custom Socket.IO server share this process.
const realtime = globalThis as typeof globalThis & { flirraEmit?: Emit; flirraEmitPublicPresence?: () => void };
export function setEmitter(fn: Emit) { realtime.flirraEmit = fn; }
export function setPublicPresenceEmitter(fn: () => void) { realtime.flirraEmitPublicPresence = fn; }
export function notifyPublicPresence() { realtime.flirraEmitPublicPresence?.(); }
export function emitTo(userId: string, event: string, payload: unknown) { realtime.flirraEmit?.(userId, event, payload); }
const emit = emitTo;

const partnerInclude = { profile: true } as const;

export async function liveCallFor(userId: string) {
  return prisma.videoCall.findFirst({
    where: { status: { in: ["RINGING", "ACTIVE"] }, OR: [{ callerId: userId }, { recipientId: userId }] },
    orderBy: { createdAt: "desc" },
    include: { caller: { include: partnerInclude }, recipient: { include: partnerInclude }, participants: { select: { userId: true, consentedAt: true, leftAt: true } } },
  });
}

export function serializeCall(call: any, viewerId?: string) {
  if (!call) return null;
  const partner = viewerId === call.callerId ? call.recipient : viewerId === call.recipientId ? call.caller : null;
  return {
    id: call.id,
    status: call.status,
    countryFilter: call.countryFilter,
    startedAt: call.startedAt,
    endedAt: call.endedAt,
    endReason: call.endReason,
    endedById: call.endedById,
    durationSeconds: callDurationSeconds(call.startedAt, call.endedAt),
    billableSeconds: call.billableSeconds,
    coinsCharged: call.coinsCharged,
    womanCredits: call.womanCredits,
    companyCredits: call.companyCredits,
    lastBilledMinute: call.lastBilledMinute,
    createdAt: call.createdAt,
    caller: publicProfile(call.caller),
    recipient: publicProfile(call.recipient),
    partner: partner ? publicProfile(partner) : null,
    viewerRole: viewerId === call.callerId ? "CALLER" : viewerId === call.recipientId ? "RECIPIENT" : null,
    viewerAccepted: Boolean(call.participants?.find((participant: { userId: string; consentedAt: Date | null }) => participant.userId === viewerId)?.consentedAt),
    partnerAccepted: Boolean(call.participants?.find((participant: { userId: string; consentedAt: Date | null }) => participant.userId !== viewerId)?.consentedAt),
  };
}

async function blocked(a: string, b: string) {
  const row = await prisma.blockedUser.findFirst({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
  });
  return Boolean(row);
}

export async function endCall(callId: string, reason: string, endedById?: string) {
  const abusive = reason === "admin_terminate";
  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; status: CallStatus; callerId: string; recipientId: string; startedAt: Date | null }>>`
      SELECT id, status::text AS status, "callerId", "recipientId", "startedAt"
      FROM "VideoCall" WHERE id = ${callId} FOR UPDATE
    `;
    const call = rows[0];
    if (!call) return null;
    const status = terminalCallStatus(call.status, call.startedAt, reason);
    if (!status) return null;
    const endedAt = new Date();
    const ended = await tx.videoCall.update({
      where: { id: call.id },
      data: { status, endedAt, endReason: reason, endedById },
      include: { caller: { include: partnerInclude }, recipient: { include: partnerInclude } },
    });
    await tx.callParticipant.updateMany({ where: { callId, leftAt: null }, data: { leftAt: endedAt } });
    if (call.startedAt) await settleCallEarningsInTransaction(tx, callId, call.recipientId, abusive);
    const missed = reason === "ring_timeout" ? await tx.notification.create({
      data: { userId: call.recipientId, kind: "MISSED_CALL", payload: { callId, from: ended.caller.displayName } },
    }) : null;
    return { ended, missed };
  });
  if (!result) return prisma.videoCall.findUnique({ where: { id: callId } });
  const { ended, missed } = result;
  invalidatePublicStats();
  notifyPublicPresence();
  const pair = [ended.callerId, ended.recipientId].sort().join(":");
  try {
    await redis().multi()
      .del(`lock:${ended.callerId}`, `lock:${ended.recipientId}`, `ready:${ended.id}`)
      .set(`recentpair:${pair}`, "1", "EX", 300)
      .exec();
  } catch (error) {
    console.error("[call:cleanup]", error instanceof Error ? error.message : error);
  }
  if (missed) emit(ended.recipientId, "notification:new", { id: missed.id, kind: "MISSED_CALL", callId });
  for (const userId of [ended.callerId, ended.recipientId]) {
    emit(userId, "call:ended", { callId, reason, status: ended.status, call: serializeCall(ended, userId) });
  }
  return ended;
}

export async function acceptCall(callId: string, userId: string) {
  const ready = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; status: CallStatus; callerId: string; recipientId: string }>>`
      SELECT id, status::text AS status, "callerId", "recipientId" FROM "VideoCall" WHERE id = ${callId} FOR UPDATE
    `;
    const call = rows[0];
    if (!call || (call.callerId !== userId && call.recipientId !== userId) || call.status !== "RINGING") throw new Error("This match is no longer available");
    await tx.callParticipant.updateMany({ where: { callId, userId, leftAt: null, consentedAt: null }, data: { consentedAt: new Date() } });
    const participants = await tx.callParticipant.findMany({ where: { callId }, select: { userId: true, consentedAt: true, leftAt: true } });
    if (!bothCallParticipantsConsented(participants)) return false;
    await tx.videoCall.update({ where: { id: callId }, data: { status: "ACTIVE" } });
    return true;
  });
  notifyPublicPresence();
  const call = await prisma.videoCall.findUnique({ where: { id: callId }, select: { callerId: true, recipientId: true } });
  if (!call) throw new Error("This match is no longer available");
  const full = await liveCallFor(call.callerId);
  if (!full) throw new Error("Call could not be reloaded after acceptance");
  if (ready) {
    await redis().srem("searching", call.callerId);
    emit(call.callerId, "call:accepted", { call: serializeCall(full, call.callerId) });
    emit(call.recipientId, "call:accepted", { call: serializeCall(full, call.recipientId) });
  } else {
    emit(call.callerId, "call:consented", { callId, userId });
    emit(call.recipientId, "call:consented", { callId, userId });
  }
  return { call: full, ready };
}

export async function ensureNotBusy(userId: string) {
  const live = await liveCallFor(userId);
  if (live) throw new Error("Finish your current call before starting another");
}

export async function createRingingCall(callerId: string, recipientId: string, countryFilter: string) {
  if (callerId === recipientId) throw new Error("You cannot call yourself");
  if (await blocked(callerId, recipientId)) throw new Error("Matching is unavailable between these accounts");
  const [caller, recipient] = await Promise.all([
    prisma.user.findUnique({ where: { id: callerId }, include: { wallet: true, profile: true } }),
    prisma.user.findUnique({ where: { id: recipientId }, include: { profile: true } }),
  ]);
  if (!caller || !canInitiateCall({role:caller.role,accountType:caller.accountType,creatorStatus:caller.creatorStatus,status:caller.status,isGuest:caller.isGuest,emailVerified:Boolean(caller.emailVerifiedAt)})) throw new Error("Your account is not eligible to start a chat");
  const recipientPrefs = recipient?.profile?.accountSettings;
  if (recipientPrefs && typeof recipientPrefs === 'object' && (recipientPrefs as Record<string, unknown>).allowVideoCalls === false) throw new Error("That member is not accepting video calls");
  if (!recipient || !canReceiveCall({role:recipient.role,accountType:recipient.accountType,creatorStatus:recipient.creatorStatus,status:recipient.status,isGuest:recipient.isGuest,emailVerified:Boolean(recipient.emailVerifiedAt),online:Boolean(recipient.profile?.online),discoverable:Boolean(recipient.profile?.discoverable),lastSeenAt:recipient.profile?.lastSeenAt||null})) throw new Error("That member is not available");
  const { getSettings } = await import("./settings");
  const settings = await getSettings();
  if (settings.coinsPerMinute == null || settings.womanShareBps == null) throw new Error("Call pricing is not configured yet. Please try again later.");
  if (!canStartWithBalance(caller.wallet?.coinBalance ?? 0, settings.coinsPerMinute)) throw new Error("Buy coins before starting a video chat");
  await ensureNotBusy(callerId);
  await ensureNotBusy(recipientId);
  const lockCaller = await redis().set(`lock:${callerId}`, "1", "EX", 40, "NX");
  const lockRecipient = await redis().set(`lock:${recipientId}`, "1", "EX", 40, "NX");
  if (lockCaller !== "OK" || lockRecipient !== "OK") {
    if (lockCaller === "OK") await redis().del(`lock:${callerId}`);
    if (lockRecipient === "OK") await redis().del(`lock:${recipientId}`);
    throw new Error("Someone just became busy. Try again.");
  }
  const call = await prisma.videoCall.create({
    data: {
      callerId,
      recipientId,
      countryFilter,
      status: "RINGING",
      participants: {
        create: [
          { userId: callerId, role: "CALLER" },
          { userId: recipientId, role: "RECIPIENT" },
        ],
      },
    },
    include: { caller: { include: partnerInclude }, recipient: { include: partnerInclude } },
  });
  invalidatePublicStats();
  notifyPublicPresence();
  const notification = await prisma.notification.create({
    data: { userId: recipientId, kind: "INCOMING_CALL", payload: { callId: call.id, from: caller.displayName } },
  });
  emit(recipientId, "notification:new", { id: notification.id, kind: "INCOMING_CALL" });
  emit(recipientId, "call:incoming", { call: serializeCall(call, recipientId) });
  emit(callerId, "call:match-found", { callId: call.id });
  emit(callerId, "call:ringing", { call: serializeCall(call, callerId) });
  return call;
}
