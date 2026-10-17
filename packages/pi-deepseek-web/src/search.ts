/**
 * DeepSeek official Search API client. A search is a single JSON request that
 * returns ranked, structured results; no model turn or server tool is involved.
 * The request and response shapes mirror the official guide so the model can
 * use search operators and read every documented result field.
 */

import type { DeepSeekWebConfig } from "./config.ts";
import { postJson, toolEndpoint } from "./http.ts";

/** One result from `POST /v1/tools/search`, using the official field names. */
export interface SearchApiResult {
  rerank_score?: number;
  title?: string;
  url?: string;
  snippet?: string;
  summary?: string;
  content?: string;
  site_name?: string | null;
  site_icon?: string | null;
  date?: string | null;
  authority?: number;
}

/** The official Search API response envelope. */
export interface SearchApiResponse {
  results?: SearchApiResult[];
}

/** Normalized search outcome. */
export interface WebSearchResult {
  /** Number of results requested from the API. */
  count: number;
  /** Complete result objects, deduplicated by URL. */
  results: SearchApiResult[];
}

/** One search request; field names match the official request body. */
export interface SearchRequest {
  query: string;
  /** Overrides `config.searchCount`; must be an integer in 1..50. */
  count?: number;
  /** Original user question, 1–128 characters, used to understand intent. */
  ori_question?: string;
  /** IP address used to prefer localized results. */
  localization?: string;
  /** Ask the API to populate each result's `content` field. */
  need_content?: boolean;
  apiKey: string;
  config: Pick<DeepSeekWebConfig, "baseURL" | "searchCount" | "timeoutMs">;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/** Maximum Unicode code points accepted for `query` and `ori_question`. */
const MAX_QUERY_LENGTH = 128;

/** Official authority range; `-1` means unknown. */
const AUTHORITY_MIN = -1;
const AUTHORITY_MAX = 4;

/**
 * Map the official response to deduplicated results.
 *
 * @param response - parsed Search API body; `unknown` because HTTP data is
 *   untrusted and a successful status does not guarantee the documented shape.
 * @returns results in API order, first URL wins, preserving every documented
 *   field; empty strings and invalid optional fields are omitted.
 * @throws when the body or its `results` field is not the documented shape.
 */
export const mapSearchResponse = (response: unknown): SearchApiResult[] => {
  if (response === null || typeof response !== "object") {
    throw new Error("DeepSeek Search API returned an unreadable results list");
  }
  const rawResults = (response as SearchApiResponse).results;
  if (!Array.isArray(rawResults)) {
    throw new Error("DeepSeek Search API returned an unreadable results list");
  }

  const seen = new Set<string>();
  const results: SearchApiResult[] = [];
  for (const item of rawResults) {
    if (item === null || typeof item !== "object") continue;
    const url = trimmed(item.url);
    if (url === undefined || seen.has(url)) continue;
    seen.add(url);

    const result: SearchApiResult = { url };
    const title = trimmed(item.title);
    const snippet = trimmed(item.snippet);
    const summary = trimmed(item.summary);
    const content = trimmed(item.content);
    const siteName = nullableString(item.site_name);
    const siteIcon = nullableString(item.site_icon);
    const date = nullableString(item.date);
    if (title !== undefined) result.title = title;
    if (snippet !== undefined) result.snippet = snippet;
    if (summary !== undefined) result.summary = summary;
    if (content !== undefined) result.content = content;
    if (siteName !== undefined) result.site_name = siteName;
    if (siteIcon !== undefined) result.site_icon = siteIcon;
    if (date !== undefined) result.date = date;
    if (
      typeof item.authority === "number" &&
      Number.isInteger(item.authority) &&
      item.authority >= AUTHORITY_MIN &&
      item.authority <= AUTHORITY_MAX
    ) {
      result.authority = item.authority;
    }
    if (typeof item.rerank_score === "number" && Number.isFinite(item.rerank_score)) {
      result.rerank_score = item.rerank_score;
    }
    results.push(result);
  }
  return results;
};

/**
 * Run one official DeepSeek web search.
 *
 * @param request - query, optional official request fields, key and config.
 * @returns the requested count and complete normalized results.
 * @throws on invalid input, network failure, timeout, abort, non-2xx response,
 *   unreadable body, or a response without a `results` array.
 */
export const deepSeekSearch = async (request: SearchRequest): Promise<WebSearchResult> => {
  const query = validateText(request.query, "query");
  const count = request.count ?? request.config.searchCount;
  if (!Number.isInteger(count) || count < 1 || count > 50) {
    throw new Error("web_search count must be an integer between 1 and 50");
  }
  const oriQuestion =
    request.ori_question === undefined
      ? undefined
      : validateText(request.ori_question, "ori_question");
  const localization = request.localization === undefined ? undefined : request.localization.trim();
  if (request.need_content !== undefined && typeof request.need_content !== "boolean") {
    throw new Error("web_search need_content must be a boolean");
  }

  const body: Record<string, unknown> = { query, count };
  if (oriQuestion !== undefined) body["ori_question"] = oriQuestion;
  if (localization !== undefined && localization.length > 0) body["localization"] = localization;
  if (request.need_content !== undefined) body["need_content"] = request.need_content;

  const payload = await postJson<unknown>({
    endpoint: toolEndpoint(request.config.baseURL, "search"),
    apiKey: request.apiKey,
    body,
    label: "DeepSeek web search",
    timeoutMs: request.config.timeoutMs,
    ...(request.signal !== undefined ? { signal: request.signal } : {}),
    ...(request.fetchImpl !== undefined ? { fetchImpl: request.fetchImpl } : {}),
  });

  return { count, results: mapSearchResponse(payload) };
};

/** Validate a 1–128 Unicode-character, non-blank text field. */
const validateText = (value: string, name: string): string => {
  const text = value.trim();
  if (text.length === 0 || Array.from(text).length > MAX_QUERY_LENGTH) {
    throw new Error(`web_search ${name} must be 1-${MAX_QUERY_LENGTH} characters and not blank`);
  }
  return text;
};

const trimmed = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text.length > 0 ? text : undefined;
};

const nullableString = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  return trimmed(value);
};
