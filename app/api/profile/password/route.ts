import { z } from 'zod';
import { prisma } from '@/lib/db';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { passwordSchema } from '@/lib/validators';
import { rateLimit } from '@/lib/redis';
import { clientIp } from '@/lib/utils';

const schema = z.object({ currentPassword: z.string().min(1).max(72), newPassword: passwordSchema });
export async function POST(req: Request) {
  const { user, error } = await guard();
  if (!user) return error;
  if (user.isGuest) return fail('Create an account before changing your password', 403);
  if (!(await rateLimit(`password-change:${user.id}:${clientIp(req.headers.get('x-forwarded-for'))}`, 5, 3600))) return fail('Too many password changes. Try again later.', 429);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || 'Check your password');
  if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) return fail('Your current password is incorrect', 401);
  if (parsed.data.currentPassword === parsed.data.newPassword) return fail('Choose a new password you have not used here');
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.newPassword) } });
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
  await prisma.userSession.deleteMany({ where: { userId: user.id } });
  return ok({ signedOut: true });
}
