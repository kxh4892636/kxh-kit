/**
 * DeepSeek-backed web search over the Anthropic-compatible Messages API with
 * the native `web_search_20250305` server tool. Each search costs a model turn
 * but returns structured result blocks. This mirrors
 * `@deepseek-ai/dsh-web-search-deepseek`'s wire format without depending on the
 * harness seam.
 */

/** One normalized source returned to the model. */
export interface WebSource {
  url: string;
  title?: string;
  snippet?: string;
  publishedAt?: string;
}

/** Normalized search outcome. */
export interface WebSearchResult {
  answer?: string;
  sources: WebSource[];
  truncated: boolean;
}

/** Provider fields needed to build one request. */
export interface SearchProviderConfig {
  baseURL: string;
  model: string;
  apiVersion: string;
  maxTokens: number;
  maxUses: number;
}

/** One search request. `fetchImpl` is injectable for tests. */
export interface SearchRequest {
  query: string;
  apiKey: string;
  config: SearchProviderConfig;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/** A citation location inside a `text` block (the snippet source). */
export interface CitationLocation {
  url?: string | null;
  cited_text?: string | null;
}

/** A `text` content block: the model's prose plus per-URL citations. */
export interface TextBlock {
  type: "text";
  text?: string | null;
  citations?: CitationLocation[];
}

/** A `web_search_result` item inside a `web_search_tool_result` block. */
export interface WebSearchResultItem {
  url: string;
  title?: string | null;
  page_age?: string | null;
}

/** A `web_search_tool_result` content block: the citeable result shape. */
export interface WebSearchToolResultBlock {
  type: "web_search_tool_result";
  content?: WebSearchResultItem[];
}

/** Any content block; only `text` and `web_search_tool_result` are consumed. */
export type ContentBlock = TextBlock | WebSearchToolResultBlock | { type: string };

/** DeepSeek's Anthropic Messages response envelope. */
export interface AnthropicResponse {
  content?: ContentBlock[];
}

/** Best-effort error envelope (fields vary by gateway). */
interface AnthropicError {
  error?: { message?: string } | string;
  message?: string;
}

/**
 * Build a `url → cited_text` map from every `text` block's citations. The
 * snippet lives in a citation, keyed by URL (first occurrence wins).
 *
 * @param blocks - response content blocks; non-`text` blocks are skipped.
 * @returns the `url → cited_text` map (empty when no citations are present).
 */
export function citationSnippets(blocks: readonly ContentBlock[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const block of blocks) {
    if (block.type !== "text") continue;
    for (const cite of (block as TextBlock).citations ?? []) {
      const url = cite.url;
      const text = cite.cited_text;
      if (
        typeof url === "string" &&
        url.length > 0 &&
        typeof text === "string" &&
        text.length > 0 &&
        !map.has(url)
      ) {
        map.set(url, text);
      }
    }
  }
  return map;
}

/**
 * Map a DeepSeek Anthropic Messages response to a normalized search result.
 * Walks `web_search_tool_result` blocks for `web_search_result` items, joins
 * each to its citation excerpt as `snippet`, and dedupes by URL.
 *
 * @param response - the parsed Messages response body.
 * @returns the normalized result with deduped, snippet-joined sources.
 * @throws when native search produced no result block.
 */
export function mapAnthropicResponse(response: AnthropicResponse): WebSearchResult {
  const blocks = response.content ?? [];
  const resultBlocks = blocks.filter(
    (block): block is WebSearchToolResultBlock => block.type === "web_search_tool_result",
  );
  if (resultBlocks.length === 0) {
    throw new Error(
      "DeepSeek returned no web_search_tool_result blocks; the request may not have triggered native web search",
    );
  }

  const answer = joinAnswer(blocks);
  return {
    ...(answer.length > 0 ? { answer } : {}),
    sources: collectSources(resultBlocks, citationSnippets(blocks)),
    truncated: false,
  };
}

/** Project every result item into a deduped, snippet-joined source. */
const collectSources = (
  resultBlocks: readonly WebSearchToolResultBlock[],
  snippets: ReadonlyMap<string, string>,
): WebSource[] => {
  const seen = new Set<string>();
  const sources: WebSource[] = [];
  for (const block of resultBlocks) {
    const items = Array.isArray(block.content) ? block.content : [];
    for (const item of items) {
      if (item.url.length === 0 || seen.has(item.url)) continue;
      seen.add(item.url);
      sources.push(toSource(item, snippets.get(item.url)));
    }
  }
  return sources;
};

/** Normalize one result item, omitting empty optional fields. */
const toSource = (item: WebSearchResultItem, snippet: string | undefined): WebSource => {
  return {
    url: item.url,
    ...(item.title != null && item.title.length > 0 ? { title: item.title } : {}),
    ...(snippet !== undefined && snippet.length > 0 ? { snippet } : {}),
    ...(item.page_age != null && item.page_age.length > 0 ? { publishedAt: item.page_age } : {}),
  };
};

/** Join every non-empty `text` block body into one answer string. */
const joinAnswer = (blocks: readonly ContentBlock[]): string => {
  return blocks
    .filter((block): block is TextBlock => block.type === "text")
    .map((block) => (typeof block.text === "string" ? block.text.trim() : ""))
    .filter((text) => text.length > 0)
    .join("\n\n");
};

/**
 * Run one DeepSeek web search.
 *
 * @param request - query, key, provider config and optional cancellation.
 * @returns the normalized search result.
 * @throws on network failure, non-2xx responses, unreadable bodies, or a
 *   response without a native search result block.
 */
export async function deepSeekSearch(request: SearchRequest): Promise<WebSearchResult> {
  const doFetch = request.fetchImpl ?? fetch;
  const endpoint = `${request.config.baseURL.replace(/\/+$/u, "")}/messages`;
  const body = {
    model: request.config.model,
    max_tokens: request.config.maxTokens,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: `Perform a web search for the query: ${request.query}` }],
      },
    ],
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: request.config.maxUses }],
  };

  let response: Response;
  try {
    response = await doFetch(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        // DeepSeek expects `x-api-key`; an Anthropic-compatible proxy may expect
        // `Authorization: Bearer` — send both so either resolves.
        "x-api-key": request.apiKey,
        authorization: `Bearer ${request.apiKey}`,
        "anthropic-version": request.config.apiVersion,
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": "pi-deepseek-web/0.1.0",
      },
      body: JSON.stringify(body),
      ...(request.signal !== undefined ? { signal: request.signal } : {}),
    });
  } catch (error) {
    if (request.signal?.aborted === true) throw new Error("DeepSeek web search was aborted");
    throw new Error(
      `DeepSeek web search request to ${endpoint} failed: ${messageOf(error)}. ` +
        "Check network or proxy access to that endpoint.",
    );
  }

  if (!response.ok) {
    const detail = await errorDetail(response);
    throw new Error(
      `DeepSeek web search API error (HTTP ${response.status})${detail.length > 0 ? `: ${detail}` : ""}. ` +
        `Endpoint: ${endpoint}`,
    );
  }

  let payload: AnthropicResponse;
  try {
    payload = (await response.json()) as AnthropicResponse;
  } catch (error) {
    if (request.signal?.aborted === true) throw new Error("DeepSeek web search was aborted");
    throw new Error(`DeepSeek web search returned an unreadable body: ${messageOf(error)}`);
  }
  return mapAnthropicResponse(payload);
}

const errorDetail = async (response: Response): Promise<string> => {
  try {
    const parsed = (await response.json()) as AnthropicError;
    if (typeof parsed.error === "string") return parsed.error;
    const nested = parsed.error?.message;
    if (typeof nested === "string" && nested.length > 0) return nested;
    if (typeof parsed.message === "string" && parsed.message.length > 0) return parsed.message;
  } catch {
    // A malformed/non-JSON error body can only cost a richer message.
  }
  return "";
};

const messageOf = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};
