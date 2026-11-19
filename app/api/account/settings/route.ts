import { z } from 'zod';
import { prisma } from '@/lib/db';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { logout } from '@/lib/auth';
import { setAvailability } from '@/lib/matchmaking';
import { verifyPassword } from '@/lib/auth';
import { rateLimit } from '@/lib/redis';
import { clientIp } from '@/lib/utils';

const prefs = z.object({
  publicProfile: z.boolean(), showOnline: z.boolean(), allowMessages: z.boolean(),
  allowVideoCalls: z.boolean(), storyVisibility: z.enum(['PUBLIC','FOLLOWERS','PRIVATE']),
  emailNotifications: z.boolean(), messageNotifications: z.boolean(), callNotifications: z.boolean(),
  followerNotifications: z.boolean(), giftNotifications: z.boolean(), promotionalNotifications: z.boolean(),
}).strict();
const defaults = { publicProfile: true, showOnline: true, allowMessages: true, allowVideoCalls: true, storyVisibility: 'PUBLIC' as const, emailNotifications: true, messageNotifications: true, callNotifications: true, followerNotifications: true, giftNotifications: true, promotionalNotifications: false };

export async function GET() {
  const { user, error } = await guard(); if (!user) return error;
  const raw = user.profile?.accountSettings;
  const parsed = prefs.safeParse(raw && typeof raw === 'object' ? raw : {});
  return ok({ settings: { ...defaults, ...(parsed.success ? parsed.data : {}) }, email: user.email, emailVerified: Boolean(user.emailVerifiedAt), phone: null, passwordEnabled: !user.isGuest });
}

export async function PATCH(req: Request) {
  const { user, error } = await guard(); if (!user) return error;
  if (user.isGuest) return fail('Create a member account to save account settings.', 403);
  const body = await req.json().catch(() => null);
  const parsed = prefs.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || 'Check your settings.');
  try {
    await prisma.userProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, accountSettings: parsed.data }, update: { accountSettings: parsed.data, discoverable: parsed.data.publicProfile } });
    if ((!parsed.data.allowVideoCalls || !parsed.data.publicProfile) && user.profile?.online) await setAvailability(user.id, false);
    return ok({ settings: parsed.data });
  } catch (cause) { console.error('[account-settings:update]', cause); return fail('Could not save account settings.', 500); }
}

export async function POST(req: Request) {
  const { user, error } = await guard(); if (!user) return error;
  const body = await req.json().catch(() => null) as { action?: unknown; password?: unknown } | null;
  if (body?.action !== 'deactivate') return fail('Unsupported account action.');
  if (user.isGuest || user.role === 'ADMIN') return fail('This account cannot be deactivated here.', 403);
  if (!(await rateLimit(`account-deactivate:${user.id}:${clientIp(req.headers.get('x-forwarded-for'))}`, 4, 3600))) return fail('Too many deactivation attempts. Try again later.', 429);
  if (typeof body.password !== 'string' || !body.password || !(await verifyPassword(body.password, user.passwordHash))) return fail('Enter your current password to confirm deactivation.', 401);
  try {
    await prisma.user.update({ where: { id: user.id }, data: { deactivatedAt: new Date() } });
    await prisma.userProfile.updateMany({ where: { userId: user.id }, data: { online: false, discoverable: false } });
    await prisma.userSession.deleteMany({ where: { userId: user.id } });
    await logout();
    return ok({ deactivated: true });
  } catch (cause) { console.error('[account-settings:deactivate]', cause); return fail('Could not deactivate your account.', 500); }
}
