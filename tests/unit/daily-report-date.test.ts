import { describe, expect, it } from "vitest";
import { getPreviousUtcDayRange } from "@/lib/daily-report-date";

describe("daily report UTC date range", () => {
  it("uses the previous complete UTC calendar day", () => {
    const { start, end, key } = getPreviousUtcDayRange(
      new Date("2026-10-23T07:43:21.734+03:00")
    );

    expect(key).toBe("2026-10-22");
    expect(start.toISOString()).toBe("2026-10-22T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-23T00:00:00.000Z");
  });
});
