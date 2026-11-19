import { prisma } from '@/lib/db';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';

export async function GET(req: Request) {
  const { user, error } = await guard(undefined, { allowSuspended: true });
  if (!user) return error;
  const username = new URL(req.url).searchParams.get('username')?.trim().toLowerCase() || '';
  if (!/^[a-z0-9_]{3,24}$/.test(username)) return fail('Use 3–24 letters, numbers, or underscores.');
  const match = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  return ok({ available: !match || match.id === user.id });
}
