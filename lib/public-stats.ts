import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export type PublicStats = { totalMembers: number; totalVideoCalls: number; countriesReached: number; totalConnections: number };
let cachedStats: { value: PublicStats; expiresAt: number } | null = null;
export function invalidatePublicStats() { cachedStats = null; }
export async function getPublicStats(): Promise<PublicStats> {
  if (cachedStats && cachedStats.expiresAt > Date.now()) return cachedStats.value;
  const realMember: Prisma.UserWhereInput = { status: { not: 'DELETED' }, role: { in: ['MALE', 'FEMALE'] }, isGuest: false };
  const countryWhere: Prisma.UserProfileWhereInput = { country: { not: '' }, user: realMember };
  const [totalMembers, totalVideoCalls, countries, totalConnections] = await Promise.all([
    prisma.user.count({ where: realMember }), prisma.videoCall.count(),
    prisma.userProfile.groupBy({ by: ['country'], where: countryWhere }),
    prisma.videoCall.count({ where: { status: 'COMPLETED' } }),
  ]);
  const value = { totalMembers, totalVideoCalls, countriesReached: countries.length, totalConnections };
  cachedStats = { value, expiresAt: Date.now() + 30_000 };
  return value;
}
