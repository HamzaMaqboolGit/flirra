import type { Role } from "@prisma/client";
import { prisma } from "./db";
import { redis } from "./redis";
import { getSettings } from "./settings";
import { createRingingCall, emitTo } from "./calls";
import { canInitiateCall, canReceiveCall } from "./matching-rules";
import { countryAliases } from "./countries";

export type MatchGender = "MALE" | "FEMALE" | "EVERYONE";
const QUEUE = "queue:callers";

export async function enqueue(userId: string, country: string, interest = "", gender: MatchGender = "EVERYONE") {
  await redis().hset("queue:meta", userId, JSON.stringify({ country, interest, gender, at: Date.now() }));
  await redis().sadd("searching", userId);
  await redis().lrem(QUEUE, 0, userId);
  await redis().rpush(QUEUE, userId);
  await tryMatch();
}

export async function dequeue(userId: string) {
  await redis().lrem(QUEUE, 0, userId);
  await redis().srem("searching", userId);
  await redis().hdel("queue:meta", userId);
}

export async function setAvailability(userId: string, online: boolean) {
  if (online) {
    const profile = await prisma.userProfile.findUnique({ where: { userId }, select: { discoverable: true, accountSettings: true } });
    if (!profile?.discoverable) throw new Error("Turn on profile discovery before going online");
    if (profile.accountSettings && typeof profile.accountSettings === 'object' && (profile.accountSettings as Record<string, unknown>).allowVideoCalls === false) throw new Error("Enable incoming video calls in Account Settings before going online");
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true, creatorStatus: true, emailVerifiedAt: true, status: true } });
    if (!user || !canReceiveCall({role:user.role,accountType:user.accountType,creatorStatus:user.creatorStatus,status:user.status,isGuest:false,emailVerified:Boolean(user.emailVerifiedAt),online:true,discoverable:true,lastSeenAt:new Date()})) throw new Error("An active member or approved creator account with discovery enabled is required to receive calls");
  }
  await prisma.userProfile.update({ where: { userId }, data: { online, lastSeenAt: new Date() } });
  const role = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (role?.role === "MALE" || role?.role === "FEMALE") {
    const set = `online:${role.role.toLowerCase()}`;
    if (online) await redis().sadd(set, userId);
    else await redis().srem(set, userId);
  }
  if (!online) {
    const ringing = await prisma.videoCall.findMany({ where: { recipientId: userId, status: "RINGING" } });
    const { endCall } = await import("./calls");
    for (const call of ringing) await endCall(call.id, "unavailable");
  }
}

export async function candidate(callerId: string, country: string, interest: string, gender: MatchGender) {
  const allowedRoles: Role[] = gender === "EVERYONE" ? ["MALE", "FEMALE"] : [gender];
  const presenceCutoff = new Date(Date.now() - 90_000);
  const people = await prisma.user.findMany({
    where: {
      id: { not: callerId },
      role: { in: allowedRoles },
      status: "ACTIVE",
      isGuest: false,
      OR: [{ accountType: "USER" }, { accountType: "CREATOR", creatorStatus: "APPROVED" }],
      profile: { online: true, lastSeenAt: { gt: presenceCutoff }, discoverable: true, ...(country !== "Worldwide" ? { country: { in: countryAliases(country) } } : {}), ...(interest ? { interests: { has: interest } } : {}) },
      AND: [
        { sentCalls: { none: { status: { in: ["RINGING", "ACTIVE"] } } } },
        { receivedCalls: { none: { status: { in: ["RINGING", "ACTIVE"] } } } },
      ],
    },
    include: { profile: true },
    take: 30,
    orderBy: { createdAt: "desc" },
  });
  if (people.length === 0) return null;
  const ids = people.map((person) => person.id);
  const blocks = await prisma.blockedUser.findMany({ where: { OR: [{ blockerId: callerId, blockedId: { in: ids } }, { blockedId: callerId, blockerId: { in: ids } }] } });
  const blocked = new Set(blocks.flatMap((row) => [row.blockerId, row.blockedId]));
  for (const person of people) {
    if (blocked.has(person.id)) continue;
    const prefs = person.profile?.accountSettings;
    if (prefs && typeof prefs === 'object' && (prefs as Record<string, unknown>).allowVideoCalls === false) continue;
    if (!canReceiveCall({role:person.role,accountType:person.accountType,creatorStatus:person.creatorStatus,status:person.status,isGuest:person.isGuest,emailVerified:Boolean(person.emailVerifiedAt),online:Boolean(person.profile?.online),discoverable:Boolean(person.profile?.discoverable),lastSeenAt:person.profile?.lastSeenAt||null})) continue;
    if (await redis().exists(`recentpair:${[callerId, person.id].sort().join(":")}`)) continue;
    return person;
  }
  return null;
}

export async function tryMatch() {
  const ids = await redis().lrange(QUEUE, 0, 40);
  const settings = await getSettings();
  for (const userId of ids) {
    const raw = await redis().hget("queue:meta", userId);
    const metadata = raw ? JSON.parse(raw) as { country?: string; interest?: string; gender?: MatchGender } : {};
    const country = metadata.country || "Worldwide";
    const gender = metadata.gender && ["MALE", "FEMALE", "EVERYONE"].includes(metadata.gender) ? metadata.gender : "EVERYONE";
    const caller = await prisma.user.findUnique({ where: { id: userId }, include: { wallet: true } });
    if (!caller || !canInitiateCall({role:caller.role,accountType:caller.accountType,creatorStatus:caller.creatorStatus,status:caller.status,isGuest:caller.isGuest,emailVerified:Boolean(caller.emailVerifiedAt)})) {
      await dequeue(userId);
      continue;
    }
    if (settings.coinsPerMinute == null || settings.womanShareBps == null) {
      await dequeue(userId);
      emitTo(userId, "queue:error", { error: "Call pricing is not configured yet. Please try again later." });
      continue;
    }
    if ((caller.wallet?.coinBalance ?? 0) < settings.coinsPerMinute) {
      await dequeue(userId);
      emitTo(userId, "queue:error", { error: "Buy coins before starting a video chat" });
      continue;
    }
    if (await prisma.videoCall.findFirst({ where: { status: { in: ["RINGING", "ACTIVE"] }, OR: [{ callerId: userId }, { recipientId: userId }] } })) continue;
    const person = await candidate(userId, country, metadata.interest || "", gender);
    if (!person) continue;
    await redis().lrem(QUEUE, 0, userId);
    try {
      await createRingingCall(userId, person.id, country);
    } catch (error) {
      await redis().rpush(QUEUE, userId);
      console.error("[match]", error instanceof Error ? error.message : error);
    }
  }
  const waiting = await redis().lrange(QUEUE, 0, -1);
  waiting.forEach((id, index) => emitTo(id, "queue:position", { position: index + 1 }));
}

export async function sweep() {
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - (settings.callRingSeconds ?? 30) * 1000);
  const ringing = await prisma.videoCall.findMany({ where: { status: "RINGING", createdAt: { lt: cutoff } } });
  const { endCall } = await import("./calls");
  for (const call of ringing) await endCall(call.id, "ring_timeout");
  const connecting = await prisma.videoCall.findMany({where:{status:'ACTIVE',startedAt:null,updatedAt:{lt:new Date(Date.now()-30_000)}}});
  for (const call of connecting) await endCall(call.id, 'connection_timeout');
  const active = await prisma.videoCall.findMany({ where: { status: "ACTIVE", startedAt: { not: null } } });
  const { billMinute } = await import("./billing");
  const { minutesDue } = await import("./billing-math");
  const { liveCallFor, serializeCall } = await import("./calls");
  for (const call of active) {
    if (!call.startedAt) continue;
    for (let minute = call.lastBilledMinute + 1; minute <= minutesDue(call.startedAt, new Date()); minute += 1) {
      const result = await billMinute(call.id, minute);
      if (!result.ok && result.reason === "insufficient") { await endCall(call.id, "insufficient_balance"); break; }
      if (!result.ok && result.reason === "unconfigured") { await endCall(call.id, "pricing_unconfigured"); break; }
      if (result.ok && !result.duplicate) {
        const [callerWallet, recipientWallet, live] = await Promise.all([prisma.wallet.findUnique({ where: { userId: call.callerId } }), prisma.wallet.findUnique({ where: { userId: call.recipientId } }), liveCallFor(call.callerId)]);
        emitTo(call.callerId, "wallet:update", { wallet: callerWallet });
        emitTo(call.recipientId, "wallet:update", { wallet: recipientWallet });
        if (live) { emitTo(call.callerId, "call:active", { call: serializeCall(live, call.callerId) }); emitTo(call.recipientId, "call:active", { call: serializeCall(live, call.recipientId) }); }
      }
    }
  }
  const stale = new Date(Date.now() - 90_000);
  await prisma.userProfile.updateMany({ where: { online: true, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: stale } }] }, data: { online: false } });
}

export async function recoverAfterBoot() {
  const open = await prisma.videoCall.findMany({ where: { status: { in: ["RINGING", "ACTIVE"] } } });
  const { endCall } = await import("./calls");
  for (const call of open) await endCall(call.id, "server_restart");
  await redis().del(QUEUE, "queue:men", "searching");
}
