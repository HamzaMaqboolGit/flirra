import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_SESSION_SECONDS, MEMBER_SESSION_SECONDS, readSessionToken, signSessionToken,
} from "../lib/session-token";
import { adminPostAuthDestination } from "../lib/redirect";

process.env.AUTH_SECRET = "isolated-session-expiration-test-secret";
const now = Date.parse("2026-11-19T00:00:00.000Z");
const data = { id: "test-session", userId: "test-user", tokenHash: "test-token-hash" };

test("an admin credential is accepted immediately and expires after exactly 24 hours", async () => {
  const expiry = now + ADMIN_SESSION_SECONDS * 1000;
  const token = await signSessionToken({ ...data, expiresAt: new Date(expiry) }, "ADMIN", now);
  assert.equal((await readSessionToken(token, "admin", now))?.id, data.id);
  assert.ok(await readSessionToken(token, "admin", expiry - 1));
  assert.equal(await readSessionToken(token, "admin", expiry), null);
  assert.equal(await readSessionToken(token, "member", now), null);
});

test("the admin cap also applies to previously issued admin credentials with a longer expiry", async () => {
  const token = await signSessionToken({
    ...data, expiresAt: new Date(now + MEMBER_SESSION_SECONDS * 1000),
  }, "ADMIN", now);
  assert.equal(await readSessionToken(token, "admin", now + ADMIN_SESSION_SECONDS * 1000), null);
});

test("member credentials retain their own validity window and cannot authenticate as admin", async () => {
  const expiry = now + MEMBER_SESSION_SECONDS * 1000;
  const token = await signSessionToken({ ...data, expiresAt: new Date(expiry) }, "MALE", now);
  assert.equal((await readSessionToken(token, "member", expiry - 1000))?.tokenHash, data.tokenHash);
  assert.equal(await readSessionToken(token, "member", expiry), null);
  assert.equal(await readSessionToken(token, "admin", now), null);
  assert.equal(await readSessionToken("malformed-token", "member", now), null);
});

test("admin login preserves an internal section and rejects external or looping destinations", () => {
  assert.equal(adminPostAuthDestination("/admin/users?filter=active"), "/admin/users?filter=active");
  for (const destination of [undefined, "//evil.test/admin", "/discover", "/admin/login", "/admin/logout?next=/admin/users"]) {
    assert.equal(adminPostAuthDestination(destination), "/admin/dashboard");
  }
});
