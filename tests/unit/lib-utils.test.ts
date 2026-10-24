import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/time";

describe("cn helper", () => {
  it("merges Tailwind classes and prefers the latest value", () => {
    expect(cn("px-2", "px-4", "text-sm")).toBe("px-4 text-sm");
  });
});

describe("relativeTime", () => {
  it("returns Arabic relative time for recent activity", () => {
    const value = relativeTime(new Date(Date.now() - 5 * 60 * 1000));
    expect(value).toContain("قبل");
    expect(value).toContain("دقائق");
  });
});
