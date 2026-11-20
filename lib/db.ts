import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Reuse one client for the entire Node process. This is important on Hostinger
// and Supabase, where opening a client per request/route can exhaust the
// project connection limit and surface as generic auth-unavailable errors.
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
export const db = prisma;

globalForPrisma.prisma = prisma;
