export const RESERVED_SUBDOMAINS = new Set([
  "www",
  "api",
  "app",
  "admin",
  "mail",
  "support",
  "help",
  "status",
  "static",
  "assets",
]);

export function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

export function isValidSubdomain(value: string): boolean {
  return (
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value) &&
    !RESERVED_SUBDOMAINS.has(value)
  );
}

export function isValidCustomDomain(value: string): boolean {
  const host = normalizeHostname(value);
  if (
    host.length > 253 ||
    host.includes("://") ||
    host.includes("/") ||
    host.includes(":") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  ) {
    return false;
  }
  const labels = host.split(".");
  return (
    labels.length >= 2 &&
    labels.every(
      (label) =>
        label.length >= 1 &&
        label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
    )
  );
}

export function workspaceHostTarget(hostHeader: string | null): {
  subdomain?: string;
  customDomain?: string;
} | null {
  if (!hostHeader) return null;
  const host = normalizeHostname(hostHeader.split(":")[0]);
  const appDomain = normalizeHostname(
    process.env.NEXT_PUBLIC_APP_DOMAIN || "radd.app"
  );
  if (host === appDomain) return null;
  if (host.endsWith(`.${appDomain}`)) {
    const prefix = host.slice(0, -(appDomain.length + 1));
    if (prefix && !prefix.includes(".")) return { subdomain: prefix };
  }
  return { customDomain: host };
}
