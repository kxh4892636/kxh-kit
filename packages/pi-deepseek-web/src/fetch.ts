/**
 * DeepSeek official Fetch API client. The service fetches the page and returns
 * its title plus Markdown content; the plugin only validates the URL, applies a
 * character cap, and classifies the response as untrusted external text.
 */

import type { DeepSeekWebConfig } from "./config.ts";
import { postJson, toolEndpoint } from "./http.ts";

/** One fetched and truncated page. */
export interface FetchedPage {
  url: string;
  title?: string;
  content: string;
  truncated: boolean;
}

/** The official Fetch API response envelope. */
export interface FetchApiResponse {
  title?: string;
  content?: string;
}

/** One fetch request. `fetchImpl` is injectable for tests. */
export interface FetchPageRequest {
  url: string;
  apiKey: string;
  config: Pick<DeepSeekWebConfig, "baseURL" | "fetchMaxContentChars" | "timeoutMs">;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
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
 * Fetch, truncate, and normalize one URL through the official Fetch API.
 *
 * @param request - URL, key, config and optional cancellation.
 * @returns the page title (when present), Markdown content and truncation flag.
 * @throws on an invalid URL, network failure, timeout, abort, non-2xx response,
 *   unreadable body, or a response without string `content`.
 */
export const fetchPage = async (request: FetchPageRequest): Promise<FetchedPage> => {
  const target = validateUrl(request.url);
  const payload = await postJson<unknown>({
    endpoint: toolEndpoint(request.config.baseURL, "fetch"),
    apiKey: request.apiKey,
    body: { url: target.toString() },
    label: "DeepSeek web fetch",
    timeoutMs: request.config.timeoutMs,
    ...(request.signal !== undefined ? { signal: request.signal } : {}),
    ...(request.fetchImpl !== undefined ? { fetchImpl: request.fetchImpl } : {}),
  });

  if (payload === null || typeof payload !== "object") {
    throw new Error("DeepSeek Fetch API returned no readable content");
  }
  const response = payload as FetchApiResponse;
  if (typeof response.content !== "string") {
    throw new Error("DeepSeek Fetch API returned no readable content");
  }

  const limit = request.config.fetchMaxContentChars;
  const truncated = response.content.length > limit;
  const title = typeof response.title === "string" ? response.title.trim() : "";
  return {
    url: target.toString(),
    ...(title.length > 0 ? { title } : {}),
    content: truncated ? response.content.slice(0, limit) : response.content,
    truncated,
  };
};
