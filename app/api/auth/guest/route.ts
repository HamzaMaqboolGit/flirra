import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { currentUser, hashPassword, prepareUserSession } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { rateLimit, RateLimitUnavailableError } from '@/lib/redis';
import { clientIp } from '@/lib/utils';
import { getSettings } from '@/lib/settings';
import { ensureOfficialConversations } from '@/lib/support';

const guestConfirmation = z.object({ confirmedAdult: z.literal(true), acceptedTerms: z.literal(true) });

export async function POST(request: Request) {
  const confirmation = guestConfirmation.safeParse(await request.json().catch(() => null));
  if (!confirmation.success) return fail('Confirm you are 18 or older and accept the Terms to continue.', 400);

  try {
    const existing = await currentUser();
    if (existing) {
      if (!existing.isGuest) return fail('You already have a member session.', 409);
      if (existing.status !== 'ACTIVE') return fail('This account is unavailable.', 403);
      return ok({ created: false, userId: existing.id, isGuest: true });
    }

    if (!(await rateLimit(`guest:${clientIp(request.headers.get('x-forwarded-for'))}`, 5, 3600))) {
      return fail('Too many guest accounts from this connection. Try again later.', 429);
    }
    const settings = await getSettings();
    const coins = settings.guestRewardsEnabled && settings.guestWelcomeCoins != null && settings.maxPromoCoins != null
      ? Math.min(settings.guestWelcomeCoins, settings.maxPromoCoins)
      : 0;
    const id = randomUUID();
    const email = `guest+${id}@guest.flirra.invalid`;
    // Role is required by the member APIs. GuestGender is the optional public profile value.
    const role = 'MALE';
    const [passwordHash, session] = await Promise.all([
      hashPassword(randomUUID() + randomUUID()),
      prepareUserSession(id, role),
    ]);

    await prisma.$transaction(async tx => {
      await tx.user.create({ data: {
        id, email, passwordHash, role, displayName: `Guest ${id.slice(0, 8)}`, isGuest: true,
        profile: { create: { guestGender: 'PREFER_NOT_TO_SAY' } },
        wallet: { create: { coinBalance: coins, promotionalCoins: coins } },
        ...(coins > 0 ? { transactions: { create: {
          type: 'PROMOTIONAL_REWARD', coins, promotionalCoins: coins,
          idempotencyKey: `guest-welcome:${email}`, metadata: { rewardType: 'GUEST_WELCOME' },
        } } } : {}),
      } });
      await tx.userSession.create({ data: session.data });
    });

    await session.setCookie();
    await ensureOfficialConversations(id).catch(error => console.error('[guest:official-conversations]', error));
    return ok({ created: true, userId: id, isGuest: true });
  } catch (error) {
    if (error instanceof RateLimitUnavailableError) return fail('Authentication is temporarily unavailable. Please try again shortly.', 503);
    console.error('[guest:register]', error);
    return fail('Guest access is temporarily unavailable. Please try again.', 503);
  }
}
