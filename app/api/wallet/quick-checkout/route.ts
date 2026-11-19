import { z } from 'zod';
import { prisma } from '@/lib/db';
import { guard } from '@/lib/guard';
import { fail, isUniqueViolation, ok } from '@/lib/http';
import { getStripe, paymentsConfig } from '@/lib/stripe';
import { readStripeCredentials } from '@/lib/stripe-secrets';

const requestSchema = z.object({ packageId: z.string().min(1).max(100), requestId: z.string().uuid() });

export async function POST(request: Request) {
  const { user, error } = await guard(['MALE', 'FEMALE'], { maintenance: true });
  if (!user) return error;
  const config = await paymentsConfig();
  if (!config.ok) return fail(config.reason, 503);
  const credentials = await readStripeCredentials();
  if (!credentials.publishableKey) return fail('Stripe checkout needs a publishable key configured in Admin → Payment Settings.', 503);
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('Choose a valid coin package and retry checkout.');

  const pack = await prisma.coinPackage.findFirst({ where: { id: parsed.data.packageId, active: true } });
  if (!pack || !Number.isSafeInteger(pack.priceCents) || pack.priceCents < 1 || pack.coins < 1 || pack.bonusCoins < 0 || !/^[a-z]{3}$/i.test(pack.currency)) {
    return fail('This coin package is unavailable.', 404);
  }

  const stripe = await getStripe();
  let customerId = user.isGuest ? undefined : user.stripeCustomerId || undefined;
  if (!user.isGuest && !customerId) {
    const customer = await stripe.customers.create({ email: user.email, name: user.displayName, metadata: { veloraUserId: user.id } }, { idempotencyKey: `velora-customer:${user.id}` });
    customerId = customer.id;
    await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
  }

  let payment = await prisma.payment.findUnique({ where: { checkoutRequestId: parsed.data.requestId } });
  if (payment && payment.userId !== user.id) return fail('This checkout request cannot be used by this account.', 409);
  if (!payment) {
    try {
      payment = await prisma.payment.create({ data: { userId: user.id, packageId: pack.id, provider: 'stripe', status: 'PENDING', coins: pack.coins + pack.bonusCoins, amountCents: pack.priceCents, currency: pack.currency.toUpperCase(), checkoutRequestId: parsed.data.requestId } });
    } catch (cause) {
      if (!isUniqueViolation(cause)) throw cause;
      payment = await prisma.payment.findUnique({ where: { checkoutRequestId: parsed.data.requestId } });
      if (!payment || payment.userId !== user.id) return fail('Checkout is already being prepared. Please retry in a moment.', 409);
    }
  }

  try {
    let session = payment.providerSessionId ? await stripe.checkout.sessions.retrieve(payment.providerSessionId) : null;
    if (session && session.status === 'expired') {
      await prisma.payment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: 'FAILED', failureReason: 'Checkout expired' } });
      return fail('This checkout expired. Close it and choose the package again.', 409);
    }
    if (!session) {
      const origin = process.env.APP_URL || new URL(request.url).origin;
      const linkSetting = await prisma.platformSetting.findUnique({ where: { key: 'stripe.linkEnabled' }, select: { value: true } });
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        // Embedded Checkout requires Stripe's `embedded` UI mode. The old
        // `embedded_page` value is not a valid Checkout Session mode and made
        // Stripe reject the session before a client secret reached the modal.
        ui_mode: 'embedded',
        ...(linkSetting?.value === true ? { payment_method_types: ['card', 'link'] } : {}),
        ...(customerId ? { customer: customerId } : { customer_email: user.email }),
        line_items: [{ quantity: 1, price_data: { currency: pack.currency.toLowerCase(), unit_amount: pack.priceCents, product_data: { name: pack.name, description: `${pack.coins.toLocaleString()} base coins${pack.bonusCoins ? ` + ${pack.bonusCoins.toLocaleString()} bonus coins` : ''}` } } }],
        saved_payment_method_options: customerId ? { payment_method_save: 'enabled', payment_method_remove: 'enabled', allow_redisplay_filters: ['always', 'limited'] } : undefined,
        submit_type: 'pay',
        redirect_on_completion: 'if_required',
        return_url: `${origin}/wallet?checkout=return&session_id={CHECKOUT_SESSION_ID}`,
        metadata: { paymentId: payment.id, userId: user.id, packageId: pack.id, isGuest: String(user.isGuest) },
        payment_intent_data: { metadata: { paymentId: payment.id } },
      }, { idempotencyKey: `wallet-quick-checkout:${payment.id}` });
      if (!session.client_secret) throw new Error('Stripe did not provide a secure embedded checkout session.');
      payment = await prisma.payment.update({ where: { id: payment.id }, data: { providerSessionId: session.id } });
    }
    if (!session.client_secret) throw new Error('This checkout session is no longer available. Start a new checkout.');
    return ok({
      clientSecret: session.client_secret,
      publishableKey: credentials.publishableKey,
      sessionId: session.id,
      status: payment.status,
      package: { id: pack.id, name: pack.name, coins: pack.coins, bonusCoins: pack.bonusCoins, totalCoins: pack.coins + pack.bonusCoins, amountCents: pack.priceCents, currency: pack.currency },
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Stripe checkout could not be opened.';
    if (!payment.providerSessionId) await prisma.payment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: 'FAILED', failureReason: message.slice(0, 240) } });
    console.error('[wallet:quick-checkout]', cause);
    return fail('Secure checkout could not be opened. Please try again.', 503);
  }
}
