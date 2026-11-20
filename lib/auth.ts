import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import type { Prisma, Role } from "@prisma/client";
import { prisma } from "./db";
import {
  ADMIN_COOKIE, ADMIN_SESSION_SECONDS, LEGACY_USER_COOKIE,
  MEMBER_SESSION_SECONDS, USER_COOKIE, readSessionToken, signSessionToken,
} from "./session-token";

export function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken() {
  return randomBytes(32).toString("base64url");
}

export const sessionInclude = { profile: true, wallet: true, payoutAccount: true } satisfies Prisma.UserInclude;
export type SessionUser = Prisma.UserGetPayload<{ include: typeof sessionInclude }>;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export function toClientUser(user: SessionUser) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    username: user.username,
    role: user.role,
    accountType: user.accountType,
    creatorStatus: user.creatorStatus,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt,
    dateOfBirth: user.dateOfBirth,
    createdAt: user.createdAt,
    isGuest: user.isGuest,
    guestExpiresAt: user.guestExpiresAt,
    profile: user.profile,
    wallet: user.wallet,
    payoutAccount: user.payoutAccount
      ? {
          legalName: user.payoutAccount.legalName,
          country: user.payoutAccount.country,
          method: user.payoutAccount.method,
          accountHint: user.payoutAccount.accountHint,
          identityStatus: user.payoutAccount.identityStatus,
          verifiedAt: user.payoutAccount.verifiedAt,
          providerAccountRef: user.payoutAccount.providerAccountRef ? "connected" : null,
        }
      : null,
  };
}

export function publicProfile(user: { id: string; displayName: string; role: Role; isGuest?: boolean; dateOfBirth?: Date | null; profile: { country: string; bio: string; interests: string[]; avatarUrl: string | null; online: boolean; guestGender?: string | null } | null }) {
  const age = user.dateOfBirth ? Math.max(18, Math.floor((Date.now() - user.dateOfBirth.getTime()) / 31_557_600_000)) : null;
  return {
    id: user.id,
    displayName: user.displayName,
    age,
    role: user.isGuest ? (user.profile?.guestGender === "MALE" || user.profile?.guestGender === "FEMALE" ? user.profile.guestGender : null) : user.role,
    country: user.profile?.country ?? "",
    bio: user.profile?.bio ?? "",
    interests: user.profile?.interests ?? [],
    avatarUrl: user.profile?.avatarUrl ?? null,
    online: user.profile?.online ?? false,
  };
}

async function writeSessionCookie(role: Role, token: string, expiresAt: Date) {
  const jar = await cookies();
  jar.set(role === "ADMIN" ? ADMIN_COOKIE : USER_COOKIE, token, {
    httpOnly: true,
    // Hostinger deployments occasionally omit NODE_ENV; APP_URL still lets us
    // enforce secure cookies whenever the public site is HTTPS.
    secure: process.env.NODE_ENV === "production" || process.env.APP_URL?.startsWith("https://") === true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

async function prepareRoleSession(userId: string, role: Role) {
  const now = Date.now();
  const lifetime = role === "ADMIN" ? ADMIN_SESSION_SECONDS : MEMBER_SESSION_SECONDS;
  const data = {
    id: randomUUID(),
    userId,
    tokenHash: hashToken(randomToken()),
    expiresAt: new Date(now + lifetime * 1000),
  };
  const token = await signSessionToken(data, role, now);
  return { data, setCookie: () => writeSessionCookie(role, token, data.expiresAt) };
}

export async function prepareUserSession(userId: string, role: Role) {
  if (role === "ADMIN") throw new Error("Administrator accounts cannot create member sessions.");
  return prepareRoleSession(userId, role);
}

export async function createUserSession(userId: string, role: Role) {
  const session = await prepareUserSession(userId, role);
  await prisma.userSession.create({ data: session.data });
  await session.setCookie();
}

export async function prepareAdminSession(userId: string) {
  return prepareRoleSession(userId, "ADMIN");
}

async function loadSession(jwt: string | undefined | null, context: "admin" | "member") {
  const claims = await readSessionToken(jwt, context);
  if (!claims) return null;
  try {
    const session = await prisma.userSession.findFirst({
      where: { id: claims.id, tokenHash: claims.tokenHash, userId: claims.userId, expiresAt: { gt: new Date() } },
      include: { user: { include: sessionInclude } },
    });
    const user = session?.user;
    if (!user || user.status === "BANNED" || user.status === "DELETED" || user.deactivatedAt || (user.isGuest && user.guestExpiresAt && user.guestExpiresAt <= new Date())) return null;
    if (context === "admin") {
      if (user.role !== "ADMIN" || user.status !== "ACTIVE" || user.isGuest) return null;
      const staff = await prisma.adminStaff.findUnique({ where: { userId: user.id }, select: { enabled: true } });
      if (staff && !staff.enabled) return null;
    } else if (user.role === "ADMIN") {
      return null;
    }
    return { session, user, claims };
  } catch (error) {
    console.error("[auth:session lookup]", error);
    return null;
  }
}

export async function userFromToken(jwt: string | undefined | null) {
  return (await loadSession(jwt, "member"))?.user ?? null;
}

export async function currentUser({ renew = false } = {}) {
  const jar = await cookies();
  const existing = await loadSession(jar.get(USER_COOKIE)?.value || jar.get(LEGACY_USER_COOKIE)?.value, "member");
  if (!existing) return null;
  const { session, user, claims } = existing;
  const now = Date.now();
  const lifetime = MEMBER_SESSION_SECONDS * 1000;
  if (renew && Math.min(session.expiresAt.getTime(), claims.expiresAt) - now <= lifetime * 0.7) {
    try {
      const replacement = {
        id: session.id, userId: user.id,
        tokenHash: hashToken(randomToken()), expiresAt: new Date(now + lifetime),
      };
      const token = await signSessionToken(replacement, user.role, now);
      const rotated = await prisma.userSession.updateMany({
        where: { id: session.id, tokenHash: claims.tokenHash, expiresAt: { gt: new Date() } },
        data: { tokenHash: replacement.tokenHash, expiresAt: replacement.expiresAt },
      });
      if (rotated.count) await writeSessionCookie(user.role, token, replacement.expiresAt);
    } catch (error) {
      console.error("[auth:session renewal]", error);
    }
  }
  return user;
}

export async function currentAdmin() {
  const jar = await cookies();
  return (await loadSession(jar.get(ADMIN_COOKIE)?.value, "admin"))?.user ?? null;
}

async function clearSessionCookie(cookieName: string) {
  const jar = await cookies();
  const claims = await readSessionToken(jar.get(cookieName)?.value, cookieName === ADMIN_COOKIE ? "admin" : "member");
  if (claims) {
    await prisma.userSession.deleteMany({
      where: { userId: claims.userId, ...(claims.id ? { id: claims.id } : { tokenHash: claims.tokenHash }) },
    });
  }
  jar.delete(cookieName);
}

export async function logout() { await clearSessionCookie(USER_COOKIE); await clearSessionCookie(LEGACY_USER_COOKIE); }
export async function logoutAdmin() { await clearSessionCookie(ADMIN_COOKIE); }

export function readCookie(header: string | undefined, name = USER_COOKIE) {
  if (!header) return null;
  const hit = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

export async function devLinksAllowed() {
  return process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_EMAIL_LINKS !== "false";
}
