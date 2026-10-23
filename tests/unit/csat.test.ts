import { describe, expect, it } from "vitest";
import { parseCsatRating } from "../../lib/csat";

describe("parseCsatRating", () => {
  it.each([
    ["1", 1],
    [" ٥ ", 5],
    ["۳", 3],
  ])("parses rating %s", (text, expected) => {
    expect(parseCsatRating(text)).toBe(expected);
  });

  it.each(["0", "6", "5 نجوم", "شكراً"])(
    "rejects non-rating response %s",
    (text) => {
      expect(parseCsatRating(text)).toBeNull();
    }
  );
});
