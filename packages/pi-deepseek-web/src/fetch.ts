/**
 * DeepSeek official Fetch API client, normalized to the DeepSeek Harness web
 * contract: `{ url, statusCode, body: { kind: "text", content }, truncated }`.
 * The API reports neither the target's status nor a final URL, and it fails
 * when the target yields no usable content, so a success is the requested page
 * retrieved with HTTP 200.
 */

import type { DeepSeekWebConfig } from "./config.ts";
import { postJson, toolEndpoint } from "./http.ts";

/** One decoded fetch body. The DeepSeek Fetch API returns Markdown text. */
export interface WebFetchBody {
  readonly kind: "text";
  readonly content: string;
}

/** Normalized fetch outcome. */
export interface WebFetchResult {
  readonly url: string;
  readonly statusCode: number;
  readonly body: WebFetchBody;
  readonly truncated: boolean;
}

/** One fetch request. `fetchImpl` is injectable for tests. */
export interface FetchPageRequest {
  readonly url: string;
  readonly apiKey: string;
  readonly config: Pick<DeepSeekWebConfig, "baseURL" | "fetchTimeoutMs">;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}

/** Maximum URL length accepted by the official Fetch API. */
const MAX_URL_LENGTH = 8192;

/**
 * Validate an absolute http(s) URL for the official Fetch API.
 *
 * @param raw - the model-provided URL.
 * @returns the parsed URL.
 * @throws when it is empty or over 8192 characters, not absolute http(s), has no
 *   host, or carries a username/password.
 */
export const validateUrl = (raw: string): URL => {
  if (raw.length === 0 || raw.length > MAX_URL_LENGTH) {
    throw new Error(`web_fetch URL must be between 1 and ${MAX_URL_LENGTH} characters`);
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`web_fetch requires an absolute http(s) URL, got ${JSON.stringify(raw)}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`web_fetch only supports http(s) URLs, got ${url.protocol}`);
  }
  if (url.hostname.length === 0) {
    throw new Error("web_fetch requires a URL with a host");
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new Error("web_fetch does not accept URLs with a username or password");
  }
  return url;
};

/**
 * Fetch and normalize one URL through the official Fetch API. The provider
 * never caps the body; the render layer applies `fetchMaxOutputChars`.
 *
 * @param request - URL, key, and timeout budget.
 * @returns the requested URL, HTTP 200, the Markdown body, and provider
 *   truncation (always false for this API).
 * @throws on an invalid URL, network failure, timeout, abort, non-2xx
 *   response, or a response without string `content`.
 */
export const fetchPage = async (request: FetchPageRequest): Promise<WebFetchResult> => {
  const target = validateUrl(request.url);
  const payload = await postJson<unknown>({
    endpoint: toolEndpoint(request.config.baseURL, "fetch"),
    apiKey: request.apiKey,
    body: { url: target.toString() },
    label: "DeepSeek web fetch",
    timeoutMs: request.config.fetchTimeoutMs,
    ...(request.signal !== undefined ? { signal: request.signal } : {}),
    ...(request.fetchImpl !== undefined ? { fetchImpl: request.fetchImpl } : {}),
  });

  if (payload === null || typeof payload !== "object") {
    throw new Error("DeepSeek Fetch API returned no readable content");
  }
  const response = payload as { content?: unknown };
  if (typeof response.content !== "string") {
    throw new Error("DeepSeek Fetch API returned no readable content");
  }

  return {
    url: target.toString(),
    statusCode: 200,
    body: { kind: "text", content: response.content },
    truncated: false,
  };
};
