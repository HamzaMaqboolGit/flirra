import { prisma } from '@/lib/db';

export type OrderedCoinPackage = { sortOrder: number; createdAt?: Date | string; active?: boolean };

/** Stable package ordering shared by the public catalog and authenticated wallet. */
export function orderCoinPackages<T extends OrderedCoinPackage>(packages: readonly T[], activeOnly = false): T[] {
  return packages
    .filter(pkg => !activeOnly || pkg.active !== false)
    .map((pkg, index) => ({ pkg, index }))
    .sort((left, right) => {
      const position = left.pkg.sortOrder - right.pkg.sortOrder;
      if (position) return position;
      const leftDate = left.pkg.createdAt ? new Date(left.pkg.createdAt).getTime() : NaN;
      const rightDate = right.pkg.createdAt ? new Date(right.pkg.createdAt).getTime() : NaN;
      if (Number.isFinite(leftDate) && Number.isFinite(rightDate) && leftDate !== rightDate) return leftDate - rightDate;
      return left.index - right.index;
    })
    .map(({ pkg }) => pkg);
}

/** Load the admin-managed catalog, tolerating installations that have not yet
 * applied the optional description-column migration. */
export async function getActiveCoinPackages() {
  try {
    return await prisma.coinPackage.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  } catch (error) {
    // Older deployed databases may not have the optional `description` column.
    // Retry with the pre-description fields; prices and quantities remain DB sourced.
    try {
      const legacy = await prisma.coinPackage.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true, name: true, coins: true, priceCents: true, active: true,
          sortOrder: true, currency: true, bonusCoins: true, cardColor: true,
          imageUrl: true, popular: true, createdAt: true,
        },
      });
      return legacy.map(item => ({ ...item, description: '' }));
    } catch {
      throw error;
    }
  }
}
