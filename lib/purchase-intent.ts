export const PENDING_PURCHASE_KEY = 'flirra.pendingCoinPurchase.v1';
export const PURCHASE_INTENT_TTL_MS = 30 * 60 * 1000;
export type PurchaseIntent = { packageId: string; createdAt: number };

export function parsePurchaseIntent(value: unknown, now = Date.now()): PurchaseIntent | null {
  if (!value || typeof value !== 'object') return null;
  const intent = value as Record<string, unknown>;
  if (typeof intent.packageId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(intent.packageId) || typeof intent.createdAt !== 'number' || !Number.isFinite(intent.createdAt)) return null;
  if (intent.createdAt > now || now - intent.createdAt > PURCHASE_INTENT_TTL_MS) return null;
  return { packageId: intent.packageId, createdAt: intent.createdAt };
}
