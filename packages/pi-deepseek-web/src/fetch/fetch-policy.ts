import ipaddr from "ipaddr.js";
import { TextDecoder } from "node:util";

export const MAX_FETCH_URL_LENGTH = 2_048;

export type FetchBodyKind = "html" | "text";

export type FetchFailureCategory =
  | "aborted"
  | "blocked URL"
  | "DNS resolution failed"
  | "invalid URL"
  | "network request failed"
  | "redirect blocked"
  | "response body too large"
  | "response read failed"
  | "timed out"
  | "unsupported charset"
  | "unsupported content type";

export interface FetchFailure extends Error {
  readonly category: FetchFailureCategory;
}

const fetchFailures = new WeakSet<Error>();

export const fetchFailure = (category: FetchFailureCategory): FetchFailure => {
  const failure = Object.assign(new Error(`pi-deepseek-web fetch error: ${category}`), {
    category,
  });
  fetchFailures.add(failure);
  return failure;
};

export const isFetchFailure = (value: unknown): value is FetchFailure =>
  value instanceof Error && fetchFailures.has(value);

export const validateFetchUrl = (input: string): URL => {
  if (input.length === 0 || input.length > MAX_FETCH_URL_LENGTH) {
    throw fetchFailure("invalid URL");
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw fetchFailure("invalid URL");
  }
  if (
    !(["http:", "https:"] as string[]).includes(url.protocol) ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw fetchFailure(url.username === "" && url.password === "" ? "invalid URL" : "blocked URL");
  }
  return url;
};

export const isSameOrigin = (left: URL, right: URL): boolean => left.origin === right.origin;

export const classifyContentType = (contentType: string | null): FetchBodyKind | undefined => {
  const mime = (contentType ?? "").replace(/;.*$/su, "").trim().toLowerCase();
  if (mime === "text/html" || mime === "application/xhtml+xml") {
    return "html";
  }
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime.endsWith("+json") ||
    mime.endsWith("+xml")
  ) {
    return "text";
  }
  return undefined;
};

export const parseCharset = (contentType: string | null): string | undefined => {
  const match = /;\s*charset\s*=\s*"?([^";]+)"?/iu.exec(contentType ?? "");
  return match?.[1]?.trim().toLowerCase();
};

export const createTextDecoder = (charset: string | undefined): TextDecoder => {
  try {
    return new TextDecoder(charset ?? "utf-8");
  } catch {
    throw fetchFailure("unsupported charset");
  }
};

const stripIpv6Brackets = (input: string): string =>
  input.startsWith("[") && input.endsWith("]") ? input.slice(1, -1) : input;

export const isPublicIpAddress = (input: string): boolean => {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(stripIpv6Brackets(input));
  } catch {
    return false;
  }
  if (parsed instanceof ipaddr.IPv4) {
    return parsed.range() === "unicast";
  }
  if (parsed.isIPv4MappedAddress()) {
    return parsed.toIPv4Address().range() === "unicast";
  }
  return parsed.range() === "unicast";
};
