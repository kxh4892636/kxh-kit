/**
 * DeepSeek official Search API client, normalized to the DeepSeek Harness web
 * contract: one request per query, sources projected to the portable
 * `{ url, title?, snippet?, summary?, publishedAt? }` shape, and multi-query
 * results merged round-robin, deduplicated by URL, and capped.
 *
 * Limits are deployment policy from the JSON config, never model arguments:
 * each request sends `count = min(searchCount, searchMaxResults)`,
 * `need_content: false`, and the session's triggering question as
 * `ori_question`.
 */

import type { WebSettings } from "../settings.ts";
import { postJson, toolEndpoint } from "./http.ts";

/** Most `ori_question` characters the Search API accepts. */
const ORIGINAL_QUESTION_MAX_CHARS = 128;

/** One citeable source in the portable web vocabulary. */
export interface WebSearchSource {
  readonly url: string;
  readonly title?: string;
  readonly snippet?: string;
  readonly summary?: string;
  readonly publishedAt?: string;
}

/** Normalized search outcome; `content` is provider-generated answer text. */
export interface WebSearchResult {
  readonly content?: string;
  readonly sources: WebSearchSource[];
  readonly truncated: boolean;
}

/** Official Search API request fields; the response carries the rest. */
interface SearchApiRequest {
  readonly query: string;
  readonly count: number;
  readonly ori_question?: string;
  readonly need_content: false;
}

/** One Search request; limits come from {@link WebSettings}. */
export interface SearchRequest {
  readonly query: string;
  readonly oriQuestion?: string;
  readonly apiKey: string;
  readonly config: Pick<
    WebSettings,
    "baseURL" | "searchCount" | "searchMaxResults" | "searchTimeoutMs"
  >;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}

/** One batch of queries plus the deployment limits applied to all of them. */
export interface SearchBatchRequest {
  readonly queries: readonly string[];
  readonly maxResults: number;
  readonly oriQuestion?: string;
  readonly apiKey: string;
  readonly config: Pick<
    WebSettings,
    "baseURL" | "searchCount" | "searchMaxResults" | "searchTimeoutMs"
  >;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}

/** True because JSON has no distinct record type. */
const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

/**
 * Validate the model-facing `web_search` arguments the schema cannot express.
 * Exact duplicate strings are collapsed after the count check.
 *
 * @param args - the schema-validated arguments.
 * @param maxQueries - the deployment's query cap.
 * @returns the accepted queries in first-occurrence order.
 * @throws when the list is empty, over the cap, or contains a blank entry.
 */
export const parseSearchArgs = (
  args: { queries: readonly string[] },
  maxQueries: number,
): string[] => {
  const queries = args.queries;
  if (!Array.isArray(queries) || queries.length === 0) {
    throw new Error("queries must contain at least one query");
  }
  if (queries.length > maxQueries) {
    throw new Error(
      `queries must contain at most ${maxQueries} ${maxQueries === 1 ? "query" : "queries"}`,
    );
  }
  if (queries.some((query) => typeof query !== "string" || query.trim().length === 0)) {
    throw new Error("each query must be a non-empty string");
  }
  return [...new Set(queries)];
};

/**
 * Bound the triggering user question to what `ori_question` accepts:
 * whitespace collapses to single spaces and the first 128 characters remain.
 *
 * @param question - the latest user message, when one exists.
 * @returns the bounded question, or `undefined` when nothing remains.
 */
export const boundQuestion = (question: string | undefined): string | undefined => {
  const collapsed = question?.replace(/\s+/gu, " ").trim() ?? "";
  if (collapsed.length === 0) return undefined;
  return Array.from(collapsed).slice(0, ORIGINAL_QUESTION_MAX_CHARS).join("");
};

/**
 * Map the official response to the portable source vocabulary. Mirrors the
 * harness provider: `title`, `url`, and `snippet` are required strings; `date`
 * is a string or null; ranking-only fields are dropped.
 *
 * @param response - parsed Search API body, treated as untrusted.
 * @returns sources in provider order with every present optional field.
 * @throws when the body or any result does not match the documented shape.
 */
export const mapSearchResponse = (response: unknown): WebSearchSource[] => {
  if (!isRecord(response) || !Array.isArray(response["results"])) {
    throw new Error("DeepSeek Search API returned an unreadable results list");
  }
  return response["results"].map((item) => {
    if (
      !isRecord(item) ||
      typeof item["url"] !== "string" ||
      item["url"].length === 0 ||
      typeof item["title"] !== "string" ||
      typeof item["snippet"] !== "string" ||
      (item["summary"] !== undefined && typeof item["summary"] !== "string") ||
      (item["date"] !== null && typeof item["date"] !== "string")
    ) {
      throw new Error("DeepSeek Search API returned an unreadable results list");
    }
    const url = item["url"];
    const title = item["title"].length > 0 ? item["title"] : undefined;
    const snippet = item["snippet"].length > 0 ? item["snippet"] : undefined;
    const summary =
      typeof item["summary"] === "string" && item["summary"].length > 0
        ? item["summary"]
        : undefined;
    const publishedAt =
      typeof item["date"] === "string" && item["date"].length > 0 ? item["date"] : undefined;
    return {
      url,
      ...(title !== undefined ? { title } : {}),
      ...(snippet !== undefined ? { snippet } : {}),
      ...(summary !== undefined ? { summary } : {}),
      ...(publishedAt !== undefined ? { publishedAt } : {}),
    };
  });
};

/**
 * Run one official DeepSeek web search.
 *
 * @param request - query, triggering question, key, and deployment limits.
 * @returns the normalized result, capped to `searchMaxResults`.
 * @throws on network failure, timeout, abort, non-2xx response, or an
 *   unreadable body.
 */
export const deepSeekSearch = async (request: SearchRequest): Promise<WebSearchResult> => {
  const count = Math.min(request.config.searchCount, request.config.searchMaxResults);
  const body: SearchApiRequest = {
    query: request.query,
    count,
    need_content: false,
    ...(request.oriQuestion !== undefined && request.oriQuestion.length > 0
      ? { ori_question: request.oriQuestion }
      : {}),
  };

  const response = await postJson<unknown>({
    endpoint: toolEndpoint(request.config.baseURL, "search"),
    apiKey: request.apiKey,
    body,
    label: "DeepSeek web search",
    timeoutMs: request.config.searchTimeoutMs,
    ...(request.signal !== undefined ? { signal: request.signal } : {}),
    ...(request.fetchImpl !== undefined ? { fetchImpl: request.fetchImpl } : {}),
  });

  return capResult(
    { sources: mapSearchResponse(response), truncated: false },
    request.config.searchMaxResults,
  );
};

/**
 * Run one or more searches and merge the results. A single query keeps the
 * provider's exact sources; multiple queries run concurrently and are merged
 * round-robin, deduplicated by URL, and capped. A failed search aborts its
 * siblings; the first failure is rethrown after every search settles.
 *
 * @param request - validated queries and the deployment limits.
 * @returns the combined normalized result.
 */
export const runSearchQueries = async (request: SearchBatchRequest): Promise<WebSearchResult> => {
  if (request.queries.length === 1) {
    return deepSeekSearch({
      query: request.queries[0] ?? "",
      ...(request.oriQuestion !== undefined ? { oriQuestion: request.oriQuestion } : {}),
      apiKey: request.apiKey,
      config: request.config,
      ...(request.signal !== undefined ? { signal: request.signal } : {}),
      ...(request.fetchImpl !== undefined ? { fetchImpl: request.fetchImpl } : {}),
    });
  }

  const controller = new AbortController();
  const batchSignal =
    request.signal === undefined
      ? controller.signal
      : AbortSignal.any([request.signal, controller.signal]);
  let firstFailure: { error: unknown } | undefined;
  const results: Array<WebSearchResult | undefined> = [];

  const searches = request.queries.map(async (query, index) => {
    try {
      results[index] = await deepSeekSearch({
        query,
        ...(request.oriQuestion !== undefined ? { oriQuestion: request.oriQuestion } : {}),
        apiKey: request.apiKey,
        config: request.config,
        signal: batchSignal,
        ...(request.fetchImpl !== undefined ? { fetchImpl: request.fetchImpl } : {}),
      });
    } catch (error) {
      if (firstFailure === undefined) firstFailure = { error };
      controller.abort(error);
      throw error;
    }
  });
  await Promise.allSettled(searches);
  if (firstFailure !== undefined) throw firstFailure.error;

  const settled = results.filter((result): result is WebSearchResult => result !== undefined);
  return mergeSearchResults(request.queries, settled, request.maxResults);
};

/** Cap one provider result at the deployment's source bound. */
const capResult = (result: WebSearchResult, maxResults: number): WebSearchResult => ({
  ...(result.content !== undefined ? { content: result.content } : {}),
  sources: result.sources.slice(0, maxResults),
  truncated: result.truncated || result.sources.length > maxResults,
});

/** Merge per-query results into one deduplicated, round-robin, capped result. */
export const mergeSearchResults = (
  queries: readonly string[],
  results: readonly WebSearchResult[],
  maxResults: number,
): WebSearchResult => {
  const seen = new Set<string>();
  const sources: WebSearchSource[] = [];
  let sourceRanks = 0;
  for (const result of results) sourceRanks = Math.max(sourceRanks, result.sources.length);
  let droppedSource = false;

  merge: for (let rank = 0; rank < sourceRanks; rank += 1) {
    for (const result of results) {
      const source = result.sources[rank];
      if (source === undefined || seen.has(source.url)) continue;
      seen.add(source.url);
      if (sources.length === maxResults) {
        droppedSource = true;
        break merge;
      }
      sources.push(source);
    }
  }

  const contents = results.flatMap((result, index) => {
    if (result.content === undefined || result.content.length === 0) return [];
    return [`### ${queries[index] ?? ""}\n\n${result.content}`];
  });

  return {
    ...(contents.length > 0 ? { content: contents.join("\n\n") } : {}),
    sources,
    truncated: results.some((result) => result.truncated) || droppedSource,
  };
};

/**
 * Project sources for the model: collapse whitespace in each summary and cap
 * it at `summaryMaxChars` including the ellipsis.
 *
 * @param sources - normalized sources.
 * @param summaryMaxChars - the deployment's per-source summary cap.
 * @returns the sources with bounded summaries.
 */
export const boundSources = (
  sources: readonly WebSearchSource[],
  summaryMaxChars: number,
): WebSearchSource[] => {
  return sources.map((source) => {
    const summary = source.summary?.replace(/\s+/gu, " ").trim() ?? "";
    if (summary.length === 0) return source;
    const bounded =
      summary.length <= summaryMaxChars
        ? summary
        : `${Array.from(summary)
            .slice(0, summaryMaxChars - 1)
            .join("")}…`;
    return { ...source, summary: bounded };
  });
};
