import { randomInt } from 'node:crypto';
import { prisma } from '@/lib/db';
import { currentUser, devLinksAllowed, hashToken } from '@/lib/auth';
import { sendEmail, verificationCodeEmail } from '@/lib/email';
import { fail, ok } from '@/lib/http';
import { rateLimit } from '@/lib/redis';

export async function POST(req: Request) {
  const session = await currentUser();
  if (!session || session.isGuest) return fail('Sign in with the email account you want to verify.', 401);
  if (!(await rateLimit(`resend:${session.id}`, 3, 3600))) return fail('Too many email codes requested. Try again later.', 429);
  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user || user.emailVerifiedAt) return ok({ verified: Boolean(user?.emailVerifiedAt) });
  const requestedEmail = await req.json().then(value => value && typeof value.email === 'string' ? value.email.toLowerCase() : null).catch(() => null);
  if (requestedEmail && requestedEmail !== user.email.toLowerCase()) return fail('Verification codes can only be sent to the signed-in account email.', 400);
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } });
  await prisma.emailVerificationToken.create({ data: { userId: user.id, tokenHash: hashToken(code), expiresAt: new Date(Date.now() + 15 * 60_000) } });
  const message = verificationCodeEmail(user.displayName, code);
  const result = await sendEmail(user.email, message.subject, message.html);
  if (!result.delivered && process.env.NODE_ENV === 'production') return fail('Email delivery is unavailable. Try again later.', 503);
  return ok({ sent: true, devCode: await devLinksAllowed() ? code : undefined, delivered: result.delivered });
}
