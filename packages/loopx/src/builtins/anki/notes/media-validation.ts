import * as dns from "node:dns";
import * as path from "node:path";
import * as ipaddr from "ipaddr.js";
import type { Logger } from "../logger";

export class MediaUrlBlockedError extends Error {
  constructor() {
    super(
      "URL blocked: requests to private/internal networks are not allowed. " +
        "To allow specific hosts, set the MEDIA_ALLOWED_HOSTS environment variable.",
    );
    this.name = "MediaUrlBlockedError";
  }
}

export class MediaUrlSchemeError extends Error {
  constructor(scheme: string) {
    super(`URL scheme "${scheme}" is not allowed. Only http: and https: URLs are accepted.`);
    this.name = "MediaUrlSchemeError";
  }
}

export class MediaUrlInvalidError extends Error {
  constructor() {
    super("Invalid URL provided.");
    this.name = "MediaUrlInvalidError";
  }
}

export interface MediaUrlConfig {
  readonly allowedHosts?: readonly string[];
}

const isIPv4CompatibleAddress = (ipv6: ipaddr.IPv6): boolean =>
  ipv6.parts.slice(0, 6).every((part: number): boolean => part === 0);

const extractEmbeddedIPv4 = (ipv6: ipaddr.IPv6): ipaddr.IPv4 => {
  const high = ipv6.parts[6]!;
  const low = ipv6.parts[7]!;
  return new ipaddr.IPv4([high >> 8, high & 0xff, low >> 8, low & 0xff]);
};

const parseTargetAddress = (ip: string): ipaddr.IPv4 | ipaddr.IPv6 | null => {
  if (!ipaddr.isValid(ip)) return null;
  let address: ipaddr.IPv4 | ipaddr.IPv6 = ipaddr.parse(ip);
  if (address instanceof ipaddr.IPv6) {
    if (address.isIPv4MappedAddress()) address = address.toIPv4Address();
    else if (isIPv4CompatibleAddress(address)) address = extractEmbeddedIPv4(address);
  }
  return address;
};

const normalizeIp = (value: string): string | null => parseTargetAddress(value)?.toString() ?? null;

const assertAddressAllowed = (ip: string): void => {
  const address = parseTargetAddress(ip);
  if (address?.range() !== "unicast") throw new MediaUrlBlockedError();
};

export const validateMediaUrlSyntax = (input: string): URL => {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new MediaUrlInvalidError();
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new MediaUrlSchemeError(parsed.protocol.replace(":", ""));
  }
  return parsed;
};

export const validateMediaUrl = async (
  input: string,
  config: MediaUrlConfig = {},
  logger?: Logger,
): Promise<{ hostname: string; resolvedIp: string }> => {
  const parsed = validateMediaUrlSyntax(input);
  const hostname = parsed.hostname;
  const lookupHost =
    hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  let resolved: dns.LookupAddress[];
  try {
    resolved = await dns.promises.lookup(lookupHost, { all: true });
  } catch (error: unknown) {
    logger?.warn(
      `Unable to resolve media host "${lookupHost}": ${error instanceof Error ? error.message : String(error)}`,
    );
    throw new MediaUrlInvalidError();
  }
  if (resolved.length === 0) throw new MediaUrlInvalidError();
  const resolvedIp = resolved[0]!.address;
  const allowedHosts = config.allowedHosts ?? [];
  const hostnameAllowed = allowedHosts.includes(hostname) || allowedHosts.includes(lookupHost);
  const allowedIps = allowedHosts
    .map(normalizeIp)
    .filter((ip: string | null): ip is string => ip !== null);
  const allIpsAllowed = resolved.every(({ address }: dns.LookupAddress): boolean => {
    const normalized = normalizeIp(address);
    return normalized !== null && allowedIps.includes(normalized);
  });
  if (!hostnameAllowed && !allIpsAllowed) {
    for (const { address } of resolved) assertAddressAllowed(address);
  }
  return { hostname, resolvedIp };
};

export const sanitizeMediaFilename = (filename: string): string => {
  let sanitized = filename.split("\u0000").join("").replace(/\.\./gu, "").replace(/[/\\]/gu, "");
  sanitized = path.basename(sanitized);
  return !sanitized || sanitized.trim() === "" || sanitized === "." ? "unnamed" : sanitized;
};

export const getMediaUrlConfigFromEnv = (
  env: Readonly<Record<string, string | undefined>>,
): MediaUrlConfig => {
  const allowedHosts = env["MEDIA_ALLOWED_HOSTS"]
    ?.split(",")
    .map((host: string): string => host.trim())
    .filter((host: string): boolean => host.length > 0);
  return allowedHosts === undefined ? {} : { allowedHosts };
};
