import { prisma } from './db';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
const expired = (row: { expiresAt: Date | null } | null) => Boolean(row?.expiresAt && row.expiresAt <= new Date());

export class CoordinationUnavailableError extends Error { constructor() { super('Coordination storage is unavailable'); } }

async function read(key: string) {
  const row = await prisma.coordinationState.findUnique({ where: { key } });
  if (expired(row)) { await prisma.coordinationState.delete({ where: { key } }).catch(() => undefined); return null; }
  return row;
}
async function write(key: string, value: JsonValue, seconds?: number) {
  return prisma.coordinationState.upsert({ where: { key }, create: { key, value: value as never, expiresAt: seconds ? new Date(Date.now() + seconds * 1000) : null }, update: { value: value as never, expiresAt: seconds ? new Date(Date.now() + seconds * 1000) : null } });
}
export function coordination() {
  return {
    async hset(key: string, field: string, value: string) { const row = await read(key); const object = row?.value && typeof row.value === 'object' && !Array.isArray(row.value) ? row.value as Record<string, JsonValue> : {}; await write(key, { ...object, [field]: value }); },
    async hget(key: string, field: string) { const row = await read(key); const value = row?.value; return value && typeof value === 'object' && !Array.isArray(value) && typeof (value as Record<string, JsonValue>)[field] === 'string' ? (value as Record<string, JsonValue>)[field] as string : null; },
    async hdel(key: string, field: string) { const row = await read(key); const object = row?.value && typeof row.value === 'object' && !Array.isArray(row.value) ? { ...(row.value as Record<string, JsonValue>) } : {}; delete object[field]; await write(key, object); },
    async sadd(key: string, member: string) { const row = await read(key); const set = row?.value && Array.isArray(row.value) ? row.value.filter((v): v is string => typeof v === 'string') : []; if (!set.includes(member)) set.push(member); await write(key, set); return 1; },
    async srem(key: string, member: string) { const row = await read(key); const set = row?.value && Array.isArray(row.value) ? row.value.filter((v): v is string => typeof v === 'string' && v !== member) : []; await write(key, set); return 1; },
    async scard(key: string) { const row = await read(key); return row?.value && Array.isArray(row.value) ? row.value.length : 0; },
    async lrange(key: string, start: number, end: number) { const row = await read(key); const list = row?.value && Array.isArray(row.value) ? row.value.filter((v): v is string => typeof v === 'string') : []; return list.slice(start, end < 0 ? undefined : end + 1); },
    async lrem(key: string, _count: number, member: string) { const row = await read(key); const list = row?.value && Array.isArray(row.value) ? row.value.filter((v): v is string => typeof v === 'string' && v !== member) : []; await write(key, list); },
    async rpush(key: string, member: string) { const row = await read(key); const list = row?.value && Array.isArray(row.value) ? row.value.filter((v): v is string => typeof v === 'string') : []; list.push(member); await write(key, list); return list.length; },
    async exists(key: string) { return (await read(key)) ? 1 : 0; },
    async incr(key: string) { const row = await read(key); const value = typeof row?.value === 'number' ? row.value + 1 : 1; await write(key, value); return value; },
    async decr(key: string) { const row = await read(key); const value = typeof row?.value === 'number' ? row.value - 1 : -1; await write(key, value); return value; },
    async expire(key: string, seconds: number) { const row = await read(key); if (row) await write(key, row.value as JsonValue, seconds); },
    async del(...keys: string[]) { await Promise.all(keys.map(key => prisma.coordinationState.delete({ where: { key } }).catch(() => undefined))); },
    async set(key: string, value: string, mode?: string, seconds?: number, nx?: string) { if (nx === 'NX' && await read(key)) return null; await write(key, value, mode === 'EX' ? seconds : undefined); return 'OK'; },
    multi() { const commands: Array<Promise<unknown>> = []; const api = { del: (...keys: string[]) => { commands.push(this.del(...keys)); return api; }, set: (key: string, value: string, mode?: string, seconds?: number) => { commands.push(this.set(key, value, mode, seconds)); return api; }, exec: () => Promise.all(commands) }; return api; },
  };
}
