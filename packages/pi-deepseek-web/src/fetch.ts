/**
 * Direct HTTP(S) retrieval for the `web_fetch` tool. Validates the URL,
 * enforces byte/character/time limits, classifies the content type, and turns
 * HTML into GitHub-flavored markdown with turndown.
 */

import TurndownService from "turndown";
import { gfm } from "@joplin/turndown-plugin-gfm";

/** Content kinds this tool can return. */
export type ContentKind = "html" | "text";

/** Fetch limits resolved from plugin configuration. */
export interface FetchLimits {
  maxResponseBytes: number;
  maxBodyChars: number;
  timeoutMs: number;
}

/** One fetch request. `fetchImpl` is injectable for tests. */
export interface FetchPageRequest {
  url: string;
  config: FetchLimits;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/** A fetched and decoded page. */
export interface FetchedPage {
  url: string;
  statusCode: number;
  contentType: string | null;
  kind: ContentKind;
  content: string;
  truncated: boolean;
}

const USER_AGENT = "pi-deepseek-web/0.1.0 (+https://github.com/kxh4892636/kxh-kit)";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});
turndown.use(gfm);
turndown.remove(["script", "style", "noscript", "template", "iframe", "object", "embed"]);

/**
 * Validate an absolute http(s) URL.
 *
 * @param raw - the model-provided URL.
 * @returns the parsed URL.
 * @throws when it is not absolute or not http(s).
 */
export function validateUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`web_fetch requires an absolute http(s) URL, got ${JSON.stringify(raw)}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`web_fetch only supports http(s) URLs, got ${url.protocol}`);
  }
  return url;
}

/**
 * Classify a response content type into a supported kind.
 *
 * @param contentType - the raw `content-type` header, if any.
 * @returns `"html"`, `"text"`, or `undefined` for unsupported binary types.
 */
export function classifyContentType(contentType: string | null): ContentKind | undefined {
  if (contentType === null) return "text";
  const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (mime.length === 0) return "text";
  if (mime === "text/html" || mime === "application/xhtml+xml") return "html";
  if (mime.startsWith("text/")) return "text";
  if (mime === "application/json" || mime === "application/xml") return "text";
  if (mime.endsWith("+json") || mime.endsWith("+xml")) return "text";
  return undefined;
}

/** Convert HTML to GitHub-flavored markdown. */
const htmlToMarkdown = (html: string): string => turndown.turndown(html);

/**
 * Fetch, decode, and (for HTML) convert one URL.
 *
 * @param request - URL, limits and optional cancellation.
 * @returns the fetched page, including its HTTP status and truncation flag.
 * @throws on invalid URLs, timeout/abort, network failure, unsupported content
 *   type, or an over-limit `Content-Length`.
 */
export async function fetchPage(request: FetchPageRequest): Promise<FetchedPage> {
  const target = validateUrl(request.url);
  const limits = request.config;
  const doFetch = request.fetchImpl ?? fetch;
  const timeout = AbortSignal.timeout(limits.timeoutMs);
  const signal =
    request.signal === undefined ? timeout : AbortSignal.any([request.signal, timeout]);

  let response: Response;
  try {
    response = await doFetch(target.toString(), {
      redirect: "follow",
      headers: {
        accept: "text/html,application/xhtml+xml,text/*;q=0.9,application/json;q=0.8",
        "user-agent": USER_AGENT,
      },
      signal,
    });
  } catch (error) {
    if (request.signal?.aborted === true) {
      throw new Error(`web_fetch was aborted for ${target.toString()}`);
    }
    if (signal.aborted) {
      throw new Error(`web_fetch timed out after ${limits.timeoutMs}ms for ${target.toString()}`);
    }
    throw new Error(`web_fetch failed for ${target.toString()}: ${messageOf(error)}`);
  }

  const contentType = response.headers.get("content-type");
  const kind = classifyContentType(contentType);
  if (kind === undefined) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(
      `web_fetch does not support content type ${contentType ?? "unknown"} at ${target.toString()}`,
    );
  }

  const { bytes, truncated: truncatedByBytes } = await readCapped(
    response,
    limits.maxResponseBytes,
  );
  const decoded = decodeBody(bytes, contentType);
  const truncatedByChars = decoded.length > limits.maxBodyChars;
  const raw = truncatedByChars ? decoded.slice(0, limits.maxBodyChars) : decoded;
  const content = kind === "html" ? htmlToMarkdown(raw) : raw;

  return {
    url: response.url.length > 0 ? response.url : target.toString(),
    statusCode: response.status,
    contentType,
    kind,
    content,
    truncated: truncatedByBytes || truncatedByChars,
  };
}

const readCapped = async (
  response: Response,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> => {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (Number.isFinite(length) && length > maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`web_fetch response exceeds the maximum of ${maxBytes} bytes`);
    }
  }
  if (response.body === null) return { bytes: new Uint8Array(0), truncated: false };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      const remaining = maxBytes - total;
      if (value.byteLength > remaining) {
        chunks.push(value.subarray(0, remaining));
        total += remaining;
        truncated = true;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, truncated };
};

const decodeBody = (bytes: Uint8Array, contentType: string | null): string => {
  const charset = parseCharset(contentType);
  if (charset !== undefined) {
    try {
      return new TextDecoder(charset).decode(bytes);
    } catch {
      // Fall through to UTF-8 when the declared charset is unknown.
    }
  }
  return new TextDecoder("utf-8").decode(bytes);
};

const parseCharset = (contentType: string | null): string | undefined => {
  if (contentType === null) return undefined;
  const match = /charset\s*=\s*"?([^;"]+)"?/iu.exec(contentType);
  const charset = match?.[1]?.trim().toLowerCase();
  return charset !== undefined && charset.length > 0 ? charset : undefined;
};

const messageOf = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};
