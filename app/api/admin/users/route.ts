import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { isAdult } from '@/lib/billing-math';
import { isCountry } from '@/lib/countries';
import { hashPassword, hashToken, randomToken, devLinksAllowed } from '@/lib/auth';
import { sendEmail, verificationEmail } from '@/lib/email';

const schema = z.object({
  displayName: z.string().trim().min(2).max(40),
  email: z.string().trim().email().max(160),
  password: z.string().min(8).max(72).regex(/[A-Za-z]/).regex(/[0-9]/),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  role: z.enum(['MALE','FEMALE']),
  accountType: z.enum(['USER','CREATOR']).default('USER'),
  country: z.string().refine(isCountry, 'Choose a country'),
});

export async function POST(req: Request) {
  const { user: admin, error } = await guard(['ADMIN'], { allowSuspended: true, permission: 'users' });
  if (!admin) return error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || 'Check the new account details.');
  const input = parsed.data;
  const dob = new Date(`${input.dateOfBirth}T00:00:00.000Z`);
  if (Number.isNaN(dob.getTime()) || dob.toISOString().slice(0,10) !== input.dateOfBirth || !isAdult(dob)) return fail('The new member must be at least 18 years old.');
  const email = input.email.toLowerCase();
  try {
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) return fail('An account with that email already exists.');
    const user = await prisma.user.create({ data: {
      email, displayName: input.displayName, passwordHash: await hashPassword(input.password), dateOfBirth: dob, role: input.role, accountType: input.accountType, creatorStatus: input.accountType==='CREATOR'?'PENDING':'NOT_APPLIED',
      profile: { create: { country: input.country, discoverable: true } }, wallet: { create: { coinBalance: 0 } },
    }, select: { id: true, email: true, displayName: true } });
    const token = randomToken();
    await prisma.emailVerificationToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) } });
    const url = `${process.env.APP_URL || 'http://localhost:3000'}/verify-email?token=${token}`;
    let emailSent = true;
    try { const delivery = await sendEmail(user.email, verificationEmail(user.displayName, url).subject, verificationEmail(user.displayName, url).html); emailSent = delivery.delivered; }
    catch (cause) { emailSent = false; console.error('[admin/create-user-email]', cause); }
    await prisma.adminAuditLog.create({ data: { adminId: admin.id, action: 'USER_CREATED_BY_ADMIN', targetId: user.id, metadata: { email: user.email, role: input.role, accountType: input.accountType } } });
    return ok({ user, emailSent, devVerificationUrl: (await devLinksAllowed()) ? url : undefined }, 201);
  } catch (cause) {
    console.error('[admin/create-user]', cause);
    return fail('Could not create the account. Check that the email is unused and try again.', 500);
  }
}
