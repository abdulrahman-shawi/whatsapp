import { describe, expect, it } from "vitest";
import { getSentryTraceSampleRate } from "../../lib/sentry-sample-rate";

describe("Sentry trace sample rate", () => {
  it("uses the default when unset or invalid", () => {
    expect(getSentryTraceSampleRate(undefined)).toBe(0.1);
    expect(getSentryTraceSampleRate("invalid")).toBe(0.1);
  });

  it("clamps configured values to the supported range", () => {
    expect(getSentryTraceSampleRate("-1")).toBe(0);
    expect(getSentryTraceSampleRate("0.4")).toBe(0.4);
    expect(getSentryTraceSampleRate("2")).toBe(1);
  });
});
