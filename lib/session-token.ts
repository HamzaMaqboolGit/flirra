import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@prisma/client";

export const USER_COOKIE = "flirra_user_session";
export const ADMIN_COOKIE = "flirra_admin_session";
export const LEGACY_USER_COOKIE = "velora_session";
export const MEMBER_SESSION_SECONDS = 30 * 24 * 60 * 60;
export const ADMIN_SESSION_SECONDS = 24 * 60 * 60;

export function sessionSecret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");
  return new TextEncoder().encode(value);
}

export async function signSessionToken(
  session: { id: string; userId: string; tokenHash: string; expiresAt: Date },
  role: Role,
  now = Date.now(),
) {
  return new SignJWT({ role, session: session.tokenHash, sid: session.id })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.userId)
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor(session.expiresAt.getTime() / 1000))
    .sign(sessionSecret());
}

export async function readSessionToken(
  token: string | undefined | null,
  context: "admin" | "member",
  now = Date.now(),
) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), {
      algorithms: ["HS256"],
      requiredClaims: ["sub", "iat", "exp"],
      currentDate: new Date(now),
    });
    const { sub, iat, exp, role, session, sid } = payload;
    if (!sub || typeof session !== "string" || !session || !iat || !exp || iat > Math.floor(now / 1000)) return null;
    if (context === "admin") {
      if (role !== "ADMIN" || iat + ADMIN_SESSION_SECONDS <= now / 1000) return null;
    } else if (role !== "MALE" && role !== "FEMALE") {
      return null;
    }
    return { userId: sub, role, tokenHash: session, id: typeof sid === "string" ? sid : undefined, expiresAt: exp * 1000 };
  } catch {
    return null;
  }
}
