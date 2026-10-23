import { describe, expect, it } from "vitest";
import {
  isValidCustomDomain,
  isValidSubdomain,
  normalizeHostname,
  workspaceHostTarget,
} from "../../lib/workspace-domains";

describe("workspace domain validation", () => {
  it("accepts valid subdomains and rejects reserved names", () => {
    expect(isValidSubdomain("my-team")).toBe(true);
    expect(isValidSubdomain("api")).toBe(false);
    expect(isValidSubdomain("-bad")).toBe(false);
  });

  it("accepts public hostnames but rejects URLs, IPs, and malformed labels", () => {
    expect(isValidCustomDomain("support.example.com")).toBe(true);
    expect(isValidCustomDomain("https://support.example.com")).toBe(false);
    expect(isValidCustomDomain("127.0.0.1")).toBe(false);
    expect(isValidCustomDomain("bad..example.com")).toBe(false);
  });

  it("normalizes trailing dots and case", () => {
    expect(normalizeHostname("Support.Example.COM.")).toBe(
      "support.example.com"
    );
  });

  it("resolves subdomains and verified-domain host candidates", () => {
    expect(workspaceHostTarget("north.radd.app:443")).toEqual({
      subdomain: "north",
    });
    expect(workspaceHostTarget("help.example.com")).toEqual({
      customDomain: "help.example.com",
    });
  });
});
