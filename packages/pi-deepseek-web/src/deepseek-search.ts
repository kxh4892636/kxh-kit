import type { SearchConfig } from "./plugin-config.js";

const MAX_RESPONSE_BYTES = 5_000_000;

export interface SearchSource {
  readonly url: string;
  readonly title?: string;
  readonly snippet?: string;
  readonly publishedAt?: string;
}

export type FetchImplementation = (input: string | URL, init?: RequestInit) => Promise<Response>;

type JsonObject = Record<string, unknown>;

const searchError = (category: string): Error =>
  new Error(`pi-deepseek-web search error: ${category}`);

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireArray = (value: unknown, category: string): unknown[] => {
  if (!Array.isArray(value)) {
    throw searchError(category);
  }
  return value;
};

const optionalNonEmptyString = (value: unknown, category: string): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw searchError(category);
  }
  return value.length === 0 ? undefined : value;
};

const canonicalSourceUrl = (value: unknown): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw searchError("malformed native result URL");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw searchError("malformed native result URL");
  }
  if (
    !(["http:", "https:"] as string[]).includes(url.protocol) ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw searchError("malformed native result URL");
  }
  return url.toString();
};

const citationSnippets = (blocks: readonly unknown[]): Map<string, string> => {
  const snippets = new Map<string, string>();
  for (const block of blocks) {
    if (!isObject(block) || block["type"] !== "text" || block["citations"] === undefined) {
      continue;
    }
    const citations = requireArray(block["citations"], "malformed citation block");
    for (const citation of citations) {
      if (!isObject(citation)) {
        throw searchError("malformed citation block");
      }
      const rawUrl = optionalNonEmptyString(citation["url"], "malformed citation URL");
      const citedText = optionalNonEmptyString(citation["cited_text"], "malformed citation text");
      if (rawUrl !== undefined && citedText !== undefined) {
        const url = canonicalSourceUrl(rawUrl);
        if (!snippets.has(url)) {
          snippets.set(url, citedText);
        }
      }
    }
  }
  return snippets;
};

const sourceFromWireValue = (
  value: unknown,
  snippets: ReadonlyMap<string, string>,
): SearchSource | undefined => {
  if (!isObject(value)) {
    throw searchError("malformed native result item");
  }
  if (value["type"] !== "web_search_result") {
    return undefined;
  }
  const url = canonicalSourceUrl(value["url"]);
  const title = optionalNonEmptyString(value["title"], "malformed native result title");
  const publishedAt = optionalNonEmptyString(value["page_age"], "malformed native result age");
  const snippet = snippets.get(url);
  return {
    url,
    ...(title === undefined ? {} : { title }),
    ...(snippet === undefined ? {} : { snippet }),
    ...(publishedAt === undefined ? {} : { publishedAt }),
  };
};

export const mapDeepSeekSearchResponse = (value: unknown): SearchSource[] => {
  if (!isObject(value)) {
    throw searchError("malformed response envelope");
  }
  const blocks = requireArray(value["content"], "malformed response content");
  const nativeBlocks = blocks.filter(
    (block: unknown): boolean => isObject(block) && block["type"] === "web_search_tool_result",
  );
  if (nativeBlocks.length === 0) {
    throw searchError("missing web_search_tool_result block");
  }
  const snippets = citationSnippets(blocks);
  const seen = new Set<string>();
  const sources: SearchSource[] = [];
  for (const block of nativeBlocks) {
    if (!isObject(block)) {
      throw searchError("malformed native result block");
    }
    const items = requireArray(block["content"], "malformed native result block");
    for (const item of items) {
      const source = sourceFromWireValue(item, snippets);
      if (source !== undefined && !seen.has(source.url)) {
        seen.add(source.url);
        sources.push(source);
      }
    }
  }
  return sources;
};

const throwForAbort = (callerSignal: AbortSignal | undefined, timeoutSignal: AbortSignal): void => {
  if (callerSignal?.aborted === true) {
    throw searchError("aborted");
  }
  if (timeoutSignal.aborted) {
    throw searchError("timed out");
  }
};

const readBoundedText = async (
  response: Response,
  callerSignal: AbortSignal | undefined,
  timeoutSignal: AbortSignal,
): Promise<string> => {
  if (response.body === null) {
    return "";
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let receivedBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read().catch((_error: unknown): never => {
        throwForAbort(callerSignal, timeoutSignal);
        throw searchError("response body read failed");
      });
      if (chunk.done) {
        chunks.push(decoder.decode());
        return chunks.join("");
      }
      receivedBytes += chunk.value.byteLength;
      if (receivedBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch((): undefined => undefined);
        throw searchError("response body too large");
      }
      chunks.push(decoder.decode(chunk.value, { stream: true }));
    }
  } finally {
    reader.releaseLock();
  }
};

const readJsonResponse = async (
  response: Response,
  callerSignal: AbortSignal | undefined,
  timeoutSignal: AbortSignal,
): Promise<unknown> => {
  const text = await readBoundedText(response, callerSignal, timeoutSignal);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw searchError("invalid JSON response");
  }
};

const redactCredential = (value: string, credential: string): string =>
  value?.replaceAll(credential, "[redacted]");

const containCredential = (source: SearchSource, credential: string): SearchSource | undefined => {
  if (source.url.includes(credential)) {
    return undefined;
  }
  return {
    url: source.url,
    ...(source.title === undefined ? {} : { title: redactCredential(source.title, credential) }),
    ...(source.snippet === undefined
      ? {}
      : { snippet: redactCredential(source.snippet, credential) }),
    ...(source.publishedAt === undefined
      ? {}
      : { publishedAt: redactCredential(source.publishedAt, credential) }),
  };
};

export const searchDeepSeek = async (
  query: string,
  config: Readonly<SearchConfig>,
  callerSignal: AbortSignal | undefined,
  fetchImplementation: FetchImplementation = fetch,
): Promise<SearchSource[]> => {
  const timeoutSignal = AbortSignal.timeout(config.timeoutMs);
  const signal =
    callerSignal === undefined ? timeoutSignal : AbortSignal.any([callerSignal, timeoutSignal]);
  const endpoint = `${config.baseURL}/v1/messages`;
  let response: Response;
  try {
    response = await fetchImplementation(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        accept: "application/json",
        "anthropic-version": config.apiVersion,
        "content-type": "application/json",
        "x-api-key": config.apiKey,
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens,
        messages: [
          { role: "user", content: [{ type: "text", text: `Perform a web search for: ${query}` }] },
        ],
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: config.maxUses }],
      }),
      signal,
    });
  } catch {
    throwForAbort(callerSignal, timeoutSignal);
    throw searchError("request failed");
  }
  throwForAbort(callerSignal, timeoutSignal);
  if (!response.ok) {
    throw searchError(`HTTP ${response.status}`);
  }
  return mapDeepSeekSearchResponse(
    await readJsonResponse(response, callerSignal, timeoutSignal),
  ).flatMap((source: SearchSource): SearchSource[] => {
    const contained = containCredential(source, config.apiKey);
    return contained === undefined ? [] : [contained];
  });
};
