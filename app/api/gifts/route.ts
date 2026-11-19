import { prisma } from '@/lib/db';
import { ok } from '@/lib/http';

export async function GET() {
  const gifts = await prisma.gift.findMany({ where: { enabled: true }, orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true, imageUrl: true, coins: true, category: true, featured: true } });
  return ok({ gifts });
}
