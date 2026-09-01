import * as dns from "node:dns";
import * as path from "node:path";
import * as ipaddr from "ipaddr.js";
import mime from "mime";
import type { Logger } from "../logger";

export class MediaFileTypeError extends Error {
  constructor() {
    super(
      "File type not allowed. Only media files (images, audio, video) are accepted. " +
        "To allow additional file types, set the MEDIA_ALLOWED_TYPES environment variable.",
    );
    this.name = "MediaFileTypeError";
  }
}

export class MediaImportDirError extends Error {
  constructor(directory: string) {
    super(
      `File path is outside the allowed import directory (${directory}). ` +
        "Update MEDIA_IMPORT_DIR to change the allowed directory.",
    );
    this.name = "MediaImportDirError";
  }
}

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

export interface MediaFileConfig {
  readonly allowedTypes?: readonly string[];
  readonly importDir?: string;
}
export interface MediaUrlConfig {
  readonly allowedHosts?: readonly string[];
}

const parseList = (value: string | undefined): readonly string[] | undefined =>
  value
    ?.split(",")
    .map((item: string): string => item.trim())
    .filter((item: string): boolean => item.length > 0);

export const mediaFileConfig = (
  env: Readonly<Record<string, string | undefined>>,
): MediaFileConfig => {
  const allowedTypes = parseList(env["MEDIA_ALLOWED_TYPES"]);
  const importDir = env["MEDIA_IMPORT_DIR"];
  return {
    ...(allowedTypes === undefined ? {} : { allowedTypes }),
    ...(importDir === undefined ? {} : { importDir }),
  };
};

export const mediaUrlConfig = (
  env: Readonly<Record<string, string | undefined>>,
): MediaUrlConfig => {
  const allowedHosts = parseList(env["MEDIA_ALLOWED_HOSTS"]);
  return allowedHosts === undefined ? {} : { allowedHosts };
};

export const validateMediaFilePath = (
  file: string,
  config: MediaFileConfig,
): { readonly mimeType: string; readonly resolvedPath: string } => {
  if (file.includes("\u0000")) throw new MediaFileTypeError();
  const resolvedPath = path.resolve(file);
  const mimeType = mime.getType(resolvedPath);
  const defaultAllowed =
    mimeType !== null &&
    ["image/", "audio/", "video/"].some((prefix: string): boolean => mimeType.startsWith(prefix));
  if (!defaultAllowed && (mimeType === null || !config.allowedTypes?.includes(mimeType))) {
    throw new MediaFileTypeError();
  }
  if (config.importDir !== undefined) {
    const relative = path.relative(path.resolve(config.importDir), resolvedPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new MediaImportDirError(config.importDir);
    }
  }
  return { resolvedPath, mimeType };
};

const compatibleIpv4 = (address: ipaddr.IPv6): boolean =>
  address.parts.slice(0, 6).every((part: number): boolean => part === 0);
const embeddedIpv4 = (address: ipaddr.IPv6): ipaddr.IPv4 => {
  const high = address.parts[6]!;
  const low = address.parts[7]!;
  return new ipaddr.IPv4([high >> 8, high & 0xff, low >> 8, low & 0xff]);
};
const targetAddress = (value: string): ipaddr.IPv4 | ipaddr.IPv6 | null => {
  if (!ipaddr.isValid(value)) return null;
  let address: ipaddr.IPv4 | ipaddr.IPv6 = ipaddr.parse(value);
  if (address instanceof ipaddr.IPv6) {
    if (address.isIPv4MappedAddress()) address = address.toIPv4Address();
    else if (compatibleIpv4(address)) address = embeddedIpv4(address);
  }
  return address;
};
const normalizedIp = (value: string): string | null => targetAddress(value)?.toString() ?? null;

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
  config: MediaUrlConfig,
  logger?: Logger,
): Promise<{ readonly hostname: string; readonly resolvedIp: string }> => {
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
  const allowedHosts = config.allowedHosts ?? [];
  const allowedIps = allowedHosts
    .map(normalizedIp)
    .filter((ip: string | null): ip is string => ip !== null);
  const hostnameAllowed = allowedHosts.includes(hostname) || allowedHosts.includes(lookupHost);
  const allIpsAllowed = resolved.every(({ address }: dns.LookupAddress): boolean => {
    const normalized = normalizedIp(address);
    return normalized !== null && allowedIps.includes(normalized);
  });
  if (!hostnameAllowed && !allIpsAllowed) {
    for (const { address } of resolved) {
      if (targetAddress(address)?.range() !== "unicast") throw new MediaUrlBlockedError();
    }
  }
  return { hostname, resolvedIp: resolved[0]!.address };
};

export const sanitizeMediaFilename = (filename: string): string => {
  const cleaned = filename.split("\u0000").join("").replace(/\.\./gu, "").replace(/[/\\]/gu, "");
  const basename = path.basename(cleaned);
  return basename.trim() === "" || basename === "." ? "unnamed" : basename;
};
