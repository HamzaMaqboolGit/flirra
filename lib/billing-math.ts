/** Pure billing rules. 100 coins at 70% (7000 bps) => 70 woman credits + 30 company credits. */

export function splitCredits(coins: number, womanShareBps: number) {
  const safeCoins = Math.max(0, Math.floor(coins));
  const bps = Math.min(10000, Math.max(0, Math.floor(womanShareBps)));
  const woman = Math.floor((safeCoins * bps) / 10000);
  const company = safeCoins - woman;
  return { woman, company };
}

export function paidCoinsSpent(coins: number, promotionalCoins: number) {
  return Math.max(0, Math.floor(coins) - Math.min(Math.max(0, Math.floor(promotionalCoins)), Math.max(0, Math.floor(coins))));
}

export function creatorEligible(accountType: string, creatorStatus: string) {
  return accountType === "CREATOR" && creatorStatus === "APPROVED";
}

export function minutesDue(startedAt: Date, now: Date) {
  const elapsed = now.getTime() - startedAt.getTime();
  if (elapsed < 0) return 1;
  return Math.floor(elapsed / 60_000) + 1;
}

export function isAdult(dateOfBirth: Date, now = new Date()) {
  // Date of birth is stored as a UTC date-only value from YYYY-MM-DD input.
  // Compare UTC calendar dates to avoid rejecting someone on their birthday
  // due to the server's timezone offset.
  const cutoff = new Date(Date.UTC(now.getUTCFullYear() - 18, now.getUTCMonth(), now.getUTCDate()));
  return dateOfBirth <= cutoff;
}

export function payoutCents(credits: number, creditValueCents: number) {
  return Math.max(0, Math.floor(credits)) * Math.max(0, Math.floor(creditValueCents));
}
