import { describe, expect, it } from "vitest";
import { canReserveTokens } from "../../lib/billing/ai-usage";
import { trialEndDate, TRIAL_DURATION_DAYS } from "../../lib/billing/trial";

describe("plan limits and trial duration", () => {
  it("does not allow AI usage to exceed its token budget", () => {
    expect(canReserveTokens(100, 500, 400)).toBe(true);
    expect(canReserveTokens(101, 500, 400)).toBe(false);
    expect(canReserveTokens(500, 500, 1)).toBe(false);
  });

  it("rejects invalid token reservations", () => {
    expect(canReserveTokens(-1, 500, 1)).toBe(false);
    expect(canReserveTokens(1, 500, 0)).toBe(false);
  });

  it("sets a trial to exactly 14 days", () => {
    const startedAt = new Date("2026-10-23T00:00:00.000Z");
    expect(TRIAL_DURATION_DAYS).toBe(14);
    expect(trialEndDate(startedAt).toISOString()).toBe(
      "2026-11-06T00:00:00.000Z"
    );
  });
});
