// 媒体安全校验(自上游 media-validation.utils.ts 移植):
// 1. 文件路径 MIME 白名单(仅媒体类型)
// 2. URL/SSRF 校验(仅允许公网单播地址)
// 3. 文件名净化(去除路径穿越序列)

import * as path from "node:path";
import * as dns from "node:dns";
import mime from "mime";
import * as ipaddr from "ipaddr.js";

// ── 错误类 ────────────────────────────────────────────────────────────────

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
  constructor(configuredDir: string) {
    super(
      `File path is outside the allowed import directory (${configuredDir}). ` +
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

// ── 配置 ──────────────────────────────────────────────────────────────────

export interface MediaFilePathConfig {
  allowedTypes?: string[];
  importDir?: string;
}

export interface MediaUrlConfig {
  allowedHosts?: string[];
}

const DEFAULT_ALLOWED_PREFIXES = ["image/", "audio/", "video/"];

// ── SSRF 范围白名单 ───────────────────────────────────────────────────────
// fail-closed: 只放行普通公网单播地址; 私网/环回/链路本地/保留等一律拒绝。

const ALLOWED_RANGE = "unicast";

function isPublicUnicast(addr: ipaddr.IPv4 | ipaddr.IPv6): boolean {
  return addr.range() === ALLOWED_RANGE;
}

// 废弃的 IPv4-compatible IPv6(::/96): 前 6 组全零, IPv4 嵌在低 32 位。
// ipaddr.js 将其归为 unicast, 不提取的话会绕过检查直指内网 IPv4。
function isIPv4CompatibleAddress(ipv6: ipaddr.IPv6): boolean {
  return ipv6.parts.slice(0, 6).every((part) => part === 0);
}

// 从低 32 位(两个 16 位组)构造内嵌 IPv4。
// IPv6 固定 8 组, 调用方已保证是 IPv6 实例, 故下标断言非空。
function extractEmbeddedIPv4(ipv6: ipaddr.IPv6): ipaddr.IPv4 {
  const high = ipv6.parts[6]!;
  const low = ipv6.parts[7]!;
  return new ipaddr.IPv4([high >> 8, high & 0xff, low >> 8, low & 0xff]);
}

// 解析 IP; IPv6 内嵌 IPv4 目标(IPv4-mapped ::ffff:0:0/96 或废弃的 ::/96)时
// 返回内嵌 IPv4, 让下游按真实目标分类。非 IP/不可解析返回 null。
function parseTargetAddress(ip: string): ipaddr.IPv4 | ipaddr.IPv6 | null {
  if (!ipaddr.isValid(ip)) return null;
  let addr: ipaddr.IPv4 | ipaddr.IPv6 = ipaddr.parse(ip);
  if (addr instanceof ipaddr.IPv6) {
    if (addr.isIPv4MappedAddress()) addr = addr.toIPv4Address();
    else if (isIPv4CompatibleAddress(addr)) addr = extractEmbeddedIPv4(addr);
  }
  return addr;
}

// 校验单个解析地址: 必须是公网单播, 否则拒绝(fail-closed)。
function assertAddressAllowed(ip: string): void {
  const addr = parseTargetAddress(ip);
  if (!addr || !isPublicUnicast(addr)) {
    throw new MediaUrlBlockedError();
  }
}

// IP 规范化(与 SSRF 检查走同一提取逻辑), 供 allowlist 等价比较。
function normalizeIp(value: string): string | null {
  return parseTargetAddress(value)?.toString() ?? null;
}

// ── 路径校验 ──────────────────────────────────────────────────────────────

/**
 * 校验本地文件路径可作媒体导入: 扩展名须解析为允许的 MIME 类型,
 * 配置 importDir 时路径必须落在该目录内。
 */
export function validateMediaFilePath(
  filePath: string,
  config: MediaFilePathConfig = {},
): { resolvedPath: string; mimeType: string } {
  if (filePath.includes("\0")) {
    throw new MediaFileTypeError();
  }

  const resolvedPath = path.resolve(filePath);
  const detectedMime = mime.getType(resolvedPath);

  const isDefaultAllowed =
    detectedMime !== null &&
    DEFAULT_ALLOWED_PREFIXES.some((prefix) => detectedMime.startsWith(prefix));

  const isExtraAllowed =
    detectedMime !== null &&
    config.allowedTypes !== undefined &&
    config.allowedTypes.includes(detectedMime);

  if (!isDefaultAllowed && !isExtraAllowed) {
    throw new MediaFileTypeError();
  }

  if (config.importDir) {
    const resolvedImportDir = path.resolve(config.importDir);
    const normalizedImportDir = resolvedImportDir.endsWith(path.sep)
      ? resolvedImportDir
      : resolvedImportDir + path.sep;

    if (!resolvedPath.startsWith(normalizedImportDir)) {
      throw new MediaImportDirError(config.importDir);
    }
  }

  return { resolvedPath, mimeType: detectedMime };
}

// ── URL/SSRF 校验 ─────────────────────────────────────────────────────────

/**
 * 校验 URL 可安全交给 AnkiConnect 抓取: 合法 URL、http(s) 协议、
 * 全部解析 IP 均为公网单播(除非主机在 allowedHosts 中)。
 *
 * 注意: 此校验存在 DNS rebinding(TOCTOU)窗口——我们在此解析并校验,
 * 但 AnkiConnect 抓取时会重新解析。这是无法控制下游 HTTP 客户端时的固有局限。
 */
export async function validateMediaUrl(
  input: string,
  config: MediaUrlConfig = {},
): Promise<{ hostname: string; resolvedIp: string }> {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new MediaUrlInvalidError();
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new MediaUrlSchemeError(parsed.protocol.replace(":", ""));
  }

  const hostname = parsed.hostname;

  const hostnameForLookup =
    hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;

  // 解析全部地址: 主机可能有多个 A/AAAA 记录, 只校验第一个会让
  // 私网/内网记录溜过去。
  let resolved: dns.LookupAddress[];
  try {
    resolved = await dns.promises.lookup(hostnameForLookup, { all: true });
  } catch {
    throw new MediaUrlInvalidError();
  }
  if (resolved.length === 0) {
    throw new MediaUrlInvalidError();
  }

  const resolvedIp = resolved[0]!.address;

  // allowlist 逃生舱: 用户显式放行的主机名(带不带 IPv6 字面量括号均可)
  // 或 IP(按规范化值比较, 且必须全部解析地址都在列)。
  if (config.allowedHosts && config.allowedHosts.length > 0) {
    const allowedHosts = config.allowedHosts;
    const hostnameAllowed =
      allowedHosts.includes(hostname) || allowedHosts.includes(hostnameForLookup);
    const allowedIps = allowedHosts.map(normalizeIp).filter((ip): ip is string => ip !== null);
    const allIpsAllowed = resolved.every(({ address }) => {
      const normalized = normalizeIp(address);
      return normalized !== null && allowedIps.includes(normalized);
    });
    if (hostnameAllowed || allIpsAllowed) {
      return { hostname, resolvedIp };
    }
  }

  // 任一解析地址不是公网单播即拒绝
  for (const { address } of resolved) {
    assertAddressAllowed(address);
  }

  return { hostname, resolvedIp };
}

// ── 文件名净化 ────────────────────────────────────────────────────────────

/**
 * 净化媒体文件名: 去 null 字节、去 .. 序列、去路径分隔符、取 basename,
 * 空结果回落为 "unnamed"。
 */
export function sanitizeMediaFilename(filename: string): string {
  // null 字节用 split/join 去除, 避免正则控制字符触发 no-control-regex。
  let sanitized = filename.split("\u0000").join("");
  sanitized = sanitized.replace(/\.\./g, "");
  sanitized = sanitized.replace(/[/\\]/g, "");
  sanitized = path.basename(sanitized);

  if (!sanitized || sanitized.trim() === "" || sanitized === ".") {
    return "unnamed";
  }

  return sanitized;
}

// ── 从 process.env 读取配置 ────────────────────────────────────────────────

export function getMediaFilePathConfigFromEnv(): MediaFilePathConfig {
  const config: MediaFilePathConfig = {};

  const allowedTypes = process.env["MEDIA_ALLOWED_TYPES"];
  if (allowedTypes) {
    config.allowedTypes = allowedTypes
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  const importDir = process.env["MEDIA_IMPORT_DIR"];
  if (importDir) {
    config.importDir = importDir;
  }

  return config;
}

export function getMediaUrlConfigFromEnv(): MediaUrlConfig {
  const config: MediaUrlConfig = {};

  const allowedHosts = process.env["MEDIA_ALLOWED_HOSTS"];
  if (allowedHosts) {
    config.allowedHosts = allowedHosts
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
  }

  return config;
}
