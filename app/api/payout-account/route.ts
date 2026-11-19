import { prisma } from '@/lib/db';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { payoutSchema, zodError } from '@/lib/validators';
import { connectEnabled, getStripeConnect } from '@/lib/stripe';
import { encryptBankDetails, maskBankDetails } from '@/lib/payout-details';

export async function GET() {
  const { user, error } = await guard(['MALE', 'FEMALE']);
  if (!user) return error;
  const account = await prisma.payoutAccount.findUnique({ where: { userId: user.id } });
  return ok({ account: account ? { legalName: account.legalName, country: account.country, method: account.method, accountHint: account.accountHint, hasBankDetails: Boolean(account.bankDetailsEncrypted) } : null });
}

export async function POST(req: Request) {
  const { user, error } = await guard(['MALE', 'FEMALE'], { maintenance: true });
  if (!user) return error;
  const parsed = payoutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(zodError(parsed.error));
  const data = parsed.data;
  let providerAccountRef: string | undefined;
  let onboardingUrl: string | undefined;
  let bankDetailsEncrypted: string | undefined;
  let accountHint = data.accountHint;

  if (data.method === 'MANUAL') {
    const details = {
      accountHolder: data.legalName,
      bankName: data.bankName,
      accountNumber: data.accountNumber,
      routingNumber: data.routingNumber,
      iban: data.iban,
      swiftCode: data.swiftCode,
    };
    try {
      bankDetailsEncrypted = encryptBankDetails(details);
      accountHint = maskBankDetails(details);
    } catch (cause) {
      return fail(cause instanceof Error ? cause.message : 'Could not securely save bank details.', 503);
    }
  } else {
    if (!await connectEnabled()) return fail('Stripe Connect payouts are not enabled.', 503);
    try {
      const stripe = await getStripeConnect();
      const current = await prisma.payoutAccount.findUnique({ where: { userId: user.id } });
      if (current?.providerAccountRef) providerAccountRef = current.providerAccountRef;
      else {
        const account = await stripe.accounts.create({ type: 'express', country: data.country, email: user.email, capabilities: { transfers: { requested: true } }, metadata: { userId: user.id } });
        providerAccountRef = account.id;
      }
      const origin = process.env.APP_URL || new URL(req.url).origin;
      const profileReturn = `${origin}/profile?creatorView=withdrawals`;
      const link = await stripe.accountLinks.create({ account: providerAccountRef, refresh_url: profileReturn, return_url: profileReturn, type: 'account_onboarding' });
      onboardingUrl = link.url;
    } catch (cause) {
      return fail(cause instanceof Error ? cause.message : 'Could not start payout onboarding.', 503);
    }
  }

  const account = await prisma.payoutAccount.upsert({
    where: { userId: user.id },
    create: { userId: user.id, legalName: data.legalName, country: data.country, method: data.method, accountHint, providerAccountRef, bankDetailsEncrypted, identityStatus: providerAccountRef ? 'PENDING' : 'UNVERIFIED' },
    update: { legalName: data.legalName, country: data.country, method: data.method, accountHint, providerAccountRef: providerAccountRef || null, bankDetailsEncrypted: bankDetailsEncrypted || null, verifiedAt: null, identityStatus: providerAccountRef ? 'PENDING' : 'UNVERIFIED' },
    select: { legalName: true, country: true, method: true, accountHint: true, identityStatus: true, verifiedAt: true },
  });
  return ok({ account, hasBankDetails: Boolean(bankDetailsEncrypted), onboardingUrl });
}
