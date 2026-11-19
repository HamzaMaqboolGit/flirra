import assert from "node:assert/strict";
import test from "node:test";
import { isAdult, minutesDue, payoutCents, splitCredits } from "../lib/billing-math";

test("default creator/company split conserves every billed coin", () => {
  assert.deepEqual(splitCredits(10, 7000), { woman: 7, company: 3 });
  assert.deepEqual(splitCredits(11, 7000), { woman: 7, company: 4 });
  assert.equal(splitCredits(11, 7000).woman + splitCredits(11, 7000).company, 11);
});

test("minute billing advances only at full elapsed minutes after the first", () => {
  const start = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(minutesDue(start, start), 1);
  assert.equal(minutesDue(start, new Date(start.getTime() + 59_999)), 1);
  assert.equal(minutesDue(start, new Date(start.getTime() + 60_000)), 2);
});

test("adult gate compares date-only birthdays in UTC, including the birthday itself", () => {
  const now = new Date("2026-11-14T12:00:00.000Z");
  assert.equal(isAdult(new Date("2008-11-14T00:00:00.000Z"), now), true);
  assert.equal(isAdult(new Date("2008-11-15T00:00:00.000Z"), now), false);
  // At this instant it is already November 14 in Pakistan (UTC+5), but still
  // November 13 UTC. Date-only ages become valid at the UTC birthday boundary.
  assert.equal(isAdult(new Date("2008-11-14T00:00:00.000Z"), new Date("2026-11-13T20:00:00.000Z")), false);
  assert.equal(isAdult(new Date("2008-11-14T00:00:00.000Z"), new Date("2026-11-14T00:00:00.000Z")), true);
});

test("payout conversion cannot return a negative amount", () => {
  assert.equal(payoutCents(250, 2), 500);
  assert.equal(payoutCents(-10, 2), 0);
  assert.equal(payoutCents(10, -1), 0);
});
