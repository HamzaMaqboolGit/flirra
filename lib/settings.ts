import { prisma } from "./db";
import { Prisma } from "@prisma/client";

export type PlatformSettings = {
  siteName: string;
  logoUrl: string;
  maintenanceMode: boolean;
  coinsPerMinute: number | null;
  womanShareBps: number | null;
  minWithdrawalCredits: number | null;
  creditValueCents: number | null;
  supportEmail: string;
  callRingSeconds: number | null;
  emailFrom: string;
  guestWelcomeCoins: number | null;
  registeredWelcomeCoins: number | null;
  dailyRewardCoins: number | null;
  promoRewardCoins: number | null;
  rewardExpirationDays: number | null;
  maxPromoCoins: number | null;
  guestRewardsEnabled: boolean;
  registeredRewardsEnabled: boolean;
  dailyRewardsEnabled: boolean;
  promoRewardsEnabled: boolean;
};

const DEFAULTS: PlatformSettings = {
  siteName: "Velora",
  logoUrl: "",
  maintenanceMode: false,
  coinsPerMinute: null,
  womanShareBps: null,
  minWithdrawalCredits: null,
  creditValueCents: null,
  supportEmail: "support@velora.local",
  callRingSeconds: null,
  emailFrom: process.env.EMAIL_FROM || "Velora <hello@velora.local>",
  guestWelcomeCoins: null,
  registeredWelcomeCoins: null,
  dailyRewardCoins: null,
  promoRewardCoins: null,
  rewardExpirationDays: null,
  maxPromoCoins: null,
  guestRewardsEnabled: false,
  registeredRewardsEnabled: false,
  dailyRewardsEnabled: false,
  promoRewardsEnabled: false,
};

let cache: { at: number; value: PlatformSettings } | null = null;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function str(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}
function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function shapeSettings(rows: { key: string; value: unknown }[]): PlatformSettings {
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    siteName: str(map.siteName, DEFAULTS.siteName),
    logoUrl: str(map.logoUrl, DEFAULTS.logoUrl),
    maintenanceMode: bool(map.maintenanceMode, DEFAULTS.maintenanceMode),
    coinsPerMinute: num(map.coinsPerMinute),
    womanShareBps: num(map.womanShareBps),
    minWithdrawalCredits: num(map.minWithdrawalCredits),
    creditValueCents: num(map.creditValueCents),
    supportEmail: str(map.supportEmail, DEFAULTS.supportEmail),
    callRingSeconds: num(map.callRingSeconds),
    emailFrom: str(map.emailFrom, DEFAULTS.emailFrom),
    guestWelcomeCoins: num(map.guestWelcomeCoins),
    registeredWelcomeCoins: num(map.registeredWelcomeCoins),
    dailyRewardCoins: num(map.dailyRewardCoins),
    promoRewardCoins: num(map.promoRewardCoins),
    rewardExpirationDays: num(map.rewardExpirationDays),
    maxPromoCoins: num(map.maxPromoCoins),
    guestRewardsEnabled: bool(map.guestRewardsEnabled, DEFAULTS.guestRewardsEnabled),
    registeredRewardsEnabled: bool(map.registeredRewardsEnabled, DEFAULTS.registeredRewardsEnabled),
    dailyRewardsEnabled: bool(map.dailyRewardsEnabled, DEFAULTS.dailyRewardsEnabled),
    promoRewardsEnabled: bool(map.promoRewardsEnabled, DEFAULTS.promoRewardsEnabled),
  };
}

export async function getSettings() {
  if (cache && Date.now() - cache.at < 5000) return cache.value;
  const rows = await prisma.platformSetting.findMany();
  const value = shapeSettings(rows);
  cache = { at: Date.now(), value };
  return value;
}

export function clearSettingsCache() {
  cache = null;
}

export async function saveSettings(input: Partial<PlatformSettings>, adminId?: string, auditMetadata?: unknown) {
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  await prisma.$transaction(async (tx) => {
    for (const [key, value] of entries) await tx.platformSetting.upsert({
      where: { key }, create: { key, value: value === null ? Prisma.DbNull : value as never }, update: { value: value === null ? Prisma.DbNull : value as never },
    });
    if (adminId) await tx.adminAuditLog.create({ data: { adminId, action: 'SETTINGS_UPDATED', metadata: auditMetadata as never } });
  });
  clearSettingsCache();
  return getSettings();
}

export const SETTING_DEFAULTS = DEFAULTS;
