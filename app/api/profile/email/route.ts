import { z } from 'zod';
import { prisma } from '@/lib/db';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { verifyPassword, hashToken, randomToken } from '@/lib/auth';
import { devLinksAllowed } from '@/lib/auth';
import { sendEmail, verificationEmail } from '@/lib/email';
import { rateLimit } from '@/lib/redis';
import { clientIp } from '@/lib/utils';

const schema = z.object({ email: z.string().trim().email().max(160), password: z.string().min(1).max(72) });
export async function POST(req: Request) {
  const { user, error } = await guard();
  if (!user) return error;
  if (user.isGuest || !user.emailVerifiedAt) return fail('Verify your current email before changing it', 403);
  if (!(await rateLimit(`email-change:${user.id}:${clientIp(req.headers.get('x-forwarded-for'))}`, 4, 3600))) return fail('Too many email change requests. Try again later.', 429);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || 'Check the email and password');
  const email = parsed.data.email.toLowerCase();
  if (email === user.email.toLowerCase()) return fail('That is already your account email');
  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) return fail('Your current password is incorrect', 401);
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) return fail('An account with that email already exists');
  const token = randomToken();
  await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } });
  await prisma.emailVerificationToken.create({ data: { userId: user.id, tokenHash: hashToken(token), pendingEmail: email, expiresAt: new Date(Date.now() + 86_400_000) } });
  const url = `${process.env.APP_URL || 'http://localhost:3000'}/verify-email?token=${token}`;
  const message = verificationEmail(user.displayName, url);
  await sendEmail(email, 'Confirm your new Velora email', message.html);
  return ok({ sent: true, devVerificationUrl: await devLinksAllowed() ? url : undefined });
}
