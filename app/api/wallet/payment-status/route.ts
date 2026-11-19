import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  const { user, error } = await guard(undefined, { allowSuspended: true });
  if (!user) return error;
  const sessionId = new URL(request.url).searchParams.get('session_id') || '';
  if (!sessionId || sessionId.length > 255) return fail('A valid checkout session is required.');
  const payment = await prisma.payment.findFirst({
    where: { providerSessionId: sessionId, userId: user.id },
    include: { package: true },
  });
  if (!payment) return fail('Payment record not found for this account.', 404);
  const wallet = payment.status === 'SUCCEEDED'
    ? await prisma.wallet.findUnique({ where: { userId: user.id }, select: { coinBalance: true } })
    : null;
  return ok({
    status: payment.status,
    verified: payment.status === 'SUCCEEDED',
    coins: payment.status === 'SUCCEEDED' ? payment.coins : 0,
    packageName: payment.package?.name || null,
    amountCents: payment.amountCents,
    currency: payment.currency,
    paymentReference: payment.providerPaymentId,
    walletBalance: wallet?.coinBalance ?? null,
  });
}
