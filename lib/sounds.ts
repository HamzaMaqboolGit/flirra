import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export const SOUND_IDS = ["incoming_call", "outgoing_call", "random_matching", "match_found", "call_connected", "new_message", "new_notification", "missed_call", "gift_received", "call_ended"] as const;
export type SoundId = typeof SOUND_IDS[number];
export type SoundItem = { enabled: boolean; url: string; volume: number; isDefault: boolean };
export type SoundCatalog = { masterVolume: number; allowUserPreferences: boolean; sounds: Record<SoundId, SoundItem> };
const defaults: SoundCatalog = {
  masterVolume: 0.6,
  allowUserPreferences: true,
  sounds: Object.fromEntries(SOUND_IDS.map(id => [id, { enabled: id !== "random_matching", url: `/sounds/${id}.wav`, volume: 1, isDefault: true }])) as Record<SoundId, SoundItem>,
};
const clamp = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;

export function normalizeCatalog(value: unknown): SoundCatalog {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const soundInput = input.sounds && typeof input.sounds === "object" ? input.sounds as Record<string, unknown> : {};
  const sounds = Object.fromEntries(SOUND_IDS.map(id => {
    const candidate = soundInput[id] && typeof soundInput[id] === "object" ? soundInput[id] as Record<string, unknown> : {};
    const base = defaults.sounds[id];
    const url = typeof candidate.url === "string" && /^\/uploads\/sounds\/[a-zA-Z0-9._-]+$/.test(candidate.url) ? candidate.url : base.url;
    return [id, { enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : base.enabled, url, volume: clamp(candidate.volume, base.volume), isDefault: url === base.url } satisfies SoundItem];
  })) as Record<SoundId, SoundItem>;
  return { masterVolume: clamp(input.masterVolume, defaults.masterVolume), allowUserPreferences: typeof input.allowUserPreferences === "boolean" ? input.allowUserPreferences : defaults.allowUserPreferences, sounds };
}

export async function getSoundCatalog() {
  const row = await prisma.platformSetting.findUnique({ where: { key: "sound.catalog" }, select: { value: true } });
  return normalizeCatalog(row?.value);
}

export async function saveSoundCatalog(value: SoundCatalog, adminId: string) {
  const catalog = normalizeCatalog(value);
  await prisma.$transaction([
    prisma.platformSetting.upsert({ where: { key: "sound.catalog" }, create: { key: "sound.catalog", value: catalog as unknown as Prisma.InputJsonValue }, update: { value: catalog as unknown as Prisma.InputJsonValue } }),
    prisma.adminAuditLog.create({ data: { adminId, action: "SOUND_CATALOG_UPDATED", metadata: { eventCount: SOUND_IDS.length } } }),
  ]);
  return catalog;
}

export type UserSoundPreferences = { muted: Partial<Record<SoundId, boolean>>; volume: number; browserNotifications: boolean };
export function normalizeUserSoundPreferences(value: unknown): UserSoundPreferences {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const mutedInput = input.muted && typeof input.muted === "object" ? input.muted as Record<string, unknown> : {};
  return { muted: Object.fromEntries(SOUND_IDS.filter(id => typeof mutedInput[id] === "boolean").map(id => [id, mutedInput[id] as boolean])), volume: clamp(input.volume, 1), browserNotifications: input.browserNotifications === true };
}

export async function effectiveSoundConfig(userId: string) {
  const [catalog, profile] = await Promise.all([
    getSoundCatalog(),
    prisma.userProfile.findUnique({ where: { userId }, select: { accountSettings: true } }),
  ]);
  const account = profile?.accountSettings && typeof profile.accountSettings === "object" ? profile.accountSettings as Record<string, unknown> : {};
  const userPrefs = normalizeUserSoundPreferences(account.soundPreferences);
  return { catalog, preferences: catalog.allowUserPreferences ? userPrefs : { muted: {}, volume: 1, browserNotifications: userPrefs.browserNotifications } };
}

export function soundEnabledFor(userPrefs: UserSoundPreferences, catalog: SoundCatalog, id: SoundId) {
  return catalog.sounds[id].enabled && (!catalog.allowUserPreferences || userPrefs.muted[id] !== true);
}
