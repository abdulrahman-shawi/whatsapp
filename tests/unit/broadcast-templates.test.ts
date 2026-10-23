import { describe, expect, it } from "vitest";
import {
  getTemplateVariableIndexes,
  validateTemplateParams,
} from "@/lib/broadcast-templates";

describe("broadcast template variables", () => {
  it("returns unique variable indexes in ascending order", () => {
    expect(getTemplateVariableIndexes("Hi {{2}}, {{1}}, {{2}}")).toEqual([1, 2]);
  });

  it("requires a non-empty value for every numbered placeholder", () => {
    expect(validateTemplateParams("Hi {{1}}, {{2}}", ["Name", "Offer"])).toBeNull();
    expect(validateTemplateParams("Hi {{1}}, {{2}}", ["Name"])).toContain("{{2}}");
    expect(validateTemplateParams("Hi {{1}}", [" "])).toContain("غير فارغة");
  });

  it("rejects non-sequential placeholders", () => {
    expect(validateTemplateParams("Hi {{1}}, {{3}}", ["Name", "Offer"])).toContain(
      "غير متسلسل"
    );
  });
});
