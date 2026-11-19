import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { getStripe, paymentsConfig } from '@/lib/stripe';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  const { user, error } = await guard(undefined, { allowSuspended: true });
  if (!user) return error;
  if (user.isGuest) return fail('Create a member account to manage saved payment methods.', 403);
  const config = await paymentsConfig();
  if (!config.ok) return fail(config.reason, 503);
  try {
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await (await getStripe()).customers.create({ email: user.email, name: user.displayName, metadata: { veloraUserId: user.id } }, { idempotencyKey: `velora-customer:${user.id}` });
      customerId = customer.id;
      await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
    }
    const origin = process.env.APP_URL || new URL(request.url).origin;
    const session = await (await getStripe()).billingPortal.sessions.create({ customer: customerId, return_url: `${origin}/wallet` });
    return ok({ url: session.url });
  } catch (cause) {
    console.error('[wallet:payment-methods]', cause);
    return fail('Stripe payment method management is unavailable. Check that the Stripe customer portal is configured.', 503);
  }
}
