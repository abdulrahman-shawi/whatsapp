import { describe, expect, it } from "vitest";
import { getBusinessHoursInfo } from "../../lib/business-hours";

describe("getBusinessHoursInfo", () => {
  it("uses the configured timezone and workdays", () => {
    const info = getBusinessHoursInfo(
      { start: "9", end: "17", days: "0,1,2,3,4", timezone: "Asia/Riyadh" },
      new Date("2026-10-25T07:00:00.000Z")
    );
    expect(info.isOpen).toBe(true);
  });

  it("returns the next opening after daily work hours", () => {
    const info = getBusinessHoursInfo(
      { start: "9", end: "17", days: "", timezone: "UTC" },
      new Date("2026-10-23T18:30:00.000Z")
    );
    expect(info).toMatchObject({
      configured: true,
      isOpen: false,
      nextOpeningLabel: "السبت الساعة 9:00 ص",
    });
  });

  it("supports overnight shifts", () => {
    const info = getBusinessHoursInfo(
      { start: "22", end: "6", days: "5", timezone: "UTC" },
      new Date("2026-10-24T02:00:00.000Z")
    );
    expect(info.isOpen).toBe(true);
  });

  it("leaves work hours unrestricted when they are not configured", () => {
    expect(
      getBusinessHoursInfo({
        start: null,
        end: null,
        days: null,
        timezone: null,
      })
    ).toMatchObject({ configured: false, isOpen: true });
  });
});
