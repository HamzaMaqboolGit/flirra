import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { rateLimit, RateLimitUnavailableError } from "@/lib/redis";
import { clientIp } from "@/lib/utils";
import { registerSchema, zodError } from "@/lib/validators";
import { createUserSession, hashPassword } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { invalidatePublicStats } from "@/lib/public-stats";
import { ensureOfficialConversations } from "@/lib/support";

export async function POST(req: Request) {
  try {
    if (!(await rateLimit(`reg:${clientIp(req.headers.get("x-forwarded-for"))}`, 8, 3600))) return fail("Too many attempts. Try again later.", 429);
    const parsed = registerSchema.safeParse(await req.json());
    if (!parsed.success) return fail(zodError(parsed.error));
    const email = parsed.data.email.toLowerCase();
    if (await prisma.user.findUnique({ where: { email } })) return fail("An account with that email already exists");
    const settings = await getSettings();
    const welcome = settings.registeredRewardsEnabled && settings.registeredWelcomeCoins != null && settings.maxPromoCoins != null ? Math.min(settings.registeredWelcomeCoins, settings.maxPromoCoins) : 0;
    const expiresAt = settings.rewardExpirationDays ? new Date(Date.now() + settings.rewardExpirationDays * 86_400_000) : null;
    const reward = welcome > 0;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(parsed.data.password),
        displayName: parsed.data.displayName,
        dateOfBirth: new Date(`${parsed.data.dateOfBirth}T00:00:00.000Z`),
        role: parsed.data.role,
        accountType: parsed.data.accountType,
        creatorStatus: parsed.data.accountType === "CREATOR" ? "PENDING" : "NOT_APPLIED",
        profile: { create: { country: parsed.data.country } },
        wallet: { create: { coinBalance: reward ? welcome : 0, promotionalCoins: reward ? welcome : 0 } },
        ...(reward ? { transactions: { create: { type: "PROMOTIONAL_REWARD", coins: welcome, promotionalCoins: welcome, idempotencyKey: `registered-welcome:${email}`, metadata: { rewardType: "REGISTERED_WELCOME", expiresAt: expiresAt?.toISOString() || null } } }, rewardClaims: { create: { rewardType: "REGISTERED_WELCOME", coins: welcome, claimKey: `registered-welcome:${email}`, expiresAt } } } : {}),
      },
    });
    invalidatePublicStats();
    await ensureOfficialConversations(user.id);
    await createUserSession(user.id, user.role);
    return ok({ created: true, emailVerified: false });
  } catch (error) {
    if (error instanceof RateLimitUnavailableError) return fail("Authentication is temporarily unavailable. Please try again shortly.", 503);
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') return fail("An account with that email already exists", 409);
    console.error(error);
    return fail("Could not create the account", 500);
  }
}
