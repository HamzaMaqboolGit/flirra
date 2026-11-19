import { prisma } from '@/lib/db';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';

export async function GET(request: Request) {
  const { user, error } = await guard(['MALE', 'FEMALE'], { allowSuspended: true });
  if (!user) return error;
  const params = new URL(request.url).searchParams;
  const page = Math.max(1, Math.min(10000, Number(params.get('page')) || 1));
  const pageSize = 8;
  const query = (params.get('q') || '').trim().slice(0, 80);
  const days = params.get('days');
  const since = days === '30' || days === '90' ? new Date(Date.now() - Number(days) * 86_400_000) : undefined;
  const where = { recipientId: user.id, ...(since ? { createdAt: { gte: since } } : {}), ...(query ? { OR: [{ name: { contains: query, mode: 'insensitive' as const } }, { sender: { is: { displayName: { contains: query, mode: 'insensitive' as const } } } }] } : {}) };
  const [gifts, total] = await Promise.all([
    prisma.callGift.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, select: { id: true, name: true, coins: true, createdAt: true, gift: { select: { imageUrl: true } }, sender: { select: { displayName: true } } } }),
    prisma.callGift.aggregate({ where: { recipientId: user.id }, _count: { _all: true }, _sum: { coins: true } }),
  ]);
  const filteredTotal = await prisma.callGift.count({ where });
  return ok({ gifts, totalGifts: total._count._all, totalGiftCoins: total._sum.coins || 0, page, pageSize, filteredTotal });
}
