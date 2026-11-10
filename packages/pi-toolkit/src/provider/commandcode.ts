/**
 * Command Code's provider API shape. Only DeepSeek models are offered, and only
 * over OpenAI Chat Completions under `/provider/v1`: every DeepSeek entry in the
 * live catalog serves `/chat/completions`, so the Anthropic path is not wired.
 *
 * Everything here is pure: it turns the gateway's catalog and pricing pages into
 * pi model definitions, and never touches the network or the filesystem.
 * @module @kxh4892636/pi-toolkit/provider/commandcode
 */

import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";

/** Chat-model definition shape; the chat member of pi's provider model union. */
export type ProviderChatModelConfig = Extract<ProviderModelConfig, { type?: "chat" }>;

/** Provider id used by `/model`, `/login`, and `models.json` overrides. */
export const PROVIDER_ID = "commandcode";

/** Display name shown in `/login` and `/model`. */
export const PROVIDER_NAME = "Command Code";

/** Catalog endpoint; returns every chat model without requiring a credential. */
export const MODELS_URL = "https://api.commandcode.ai/provider/v1/models";

/** Human-readable pricing page; per-model rates are embedded in its payload. */
export const PRICING_URL = "https://commandcode.ai/docs/resources/pricing-limits";

/** The only vendor this provider offers; every other catalog entry is dropped. */
const DEEPSEEK_VENDOR = "deepseek";

/** Base URL; the OpenAI SDK appends `/chat/completions`. */
export const OPENAI_BASE_URL = "https://api.commandcode.ai/provider/v1";

/** Fallbacks for catalog entries that omit a context window. */
const DEFAULT_CONTEXT_WINDOW = 128_000;

/** Ceiling for the derived output limit until the real value is probed. */
const MAX_OUTPUT_CEILING = 64_000;

/** One entry of the gateway's `/models` response, reduced to what pi needs. */
export interface CatalogEntry {
  readonly id: string;
  readonly name?: string;
  readonly contextLength?: number;
  /** Endpoint paths the model serves, e.g. `["/chat/completions"]`. */
  readonly endpoints: readonly string[];
}

/** Per-million-token rates for one model, from the pricing page. */
export interface PriceEntry {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
}

/**
 * Capability hints the gateway's catalog does not publish.
 *
 * The catalog only names ids, context windows and endpoint paths, so nothing in
 * the payload says which model thinks. Every DeepSeek model on the gateway is a
 * thinking model — the vendor's model table describes each one as reasoning —
 * so the capability is a constant rather than a per-model guess.
 *
 * Only `reasoning_effort` is sent; `thinkingFormat` stays unset on purpose. The
 * gateway validates that field against `off|low|medium|high|xhigh|max` (an invalid
 * value answers 400 naming the parameter), so `off` turns thinking off through the
 * standard field. The DeepSeek-native `thinking.type` switch is accepted but
 * ignored by the gateway — `{"type":"disabled"}` still produced a full reasoning
 * trace — so it is not sent at all.
 *
 * `requiresReasoningContentOnAssistantMessages` keeps every replayed assistant
 * turn carrying `reasoning_content`, which DeepSeek documents as mandatory once
 * tools are in the request.
 *
 * @see https://api-docs.deepseek.com/zh-cn/guides/thinking_mode
 */
const DEEPSEEK_THINKING_LEVEL_MAP = {
  off: "off",
  minimal: "low",
  low: "low",
  medium: "high",
  high: "high",
  xhigh: "high",
  max: "max",
};

/** Request fields for DeepSeek thinking: the effort map does the rest. */
const DEEPSEEK_COMPAT = {
  supportsReasoningEffort: true,
  requiresReasoningContentOnAssistantMessages: true,
};

/**
 * Input modalities. Every DeepSeek model here is marked image-capable, which is
 * the workspace's standing decision; the vendor's model table only says "with
 * vision" for `deepseek/deepseek-v4-flash-vision-exp` and `deepseek/deepseek-v4.1-flash`,
 * so an image sent to one of the other five may be refused upstream.
 */
const DEEPSEEK_INPUT: ("text" | "image")[] = ["text", "image"];

/**
 * True for a DeepSeek model id. The gateway names them `deepseek/<model>`; a bare
 * `deepseek-<model>` id also counts so a catalog without vendor prefixes still works.
 */
export const isDeepSeekModel = (id: string): boolean => {
  const [vendor = ""] = id.split("/");
  return (
    vendor.toLowerCase() === DEEPSEEK_VENDOR || id.toLowerCase().startsWith(`${DEEPSEEK_VENDOR}-`)
  );
};

/**
 * Capability of one DeepSeek model: thinking on, effort selectable, images in.
 * @returns the capability fields to spread into a model definition.
 */
export const deepSeekCapability = (): Pick<
  ProviderChatModelConfig,
  "reasoning" | "input" | "thinkingLevelMap" | "compat"
> => ({
  reasoning: true,
  thinkingLevelMap: { ...DEEPSEEK_THINKING_LEVEL_MAP },
  compat: { ...DEEPSEEK_COMPAT },
  input: [...DEEPSEEK_INPUT],
});

/** Read a string field, or undefined when the payload holds something else. */
const stringAt = (value: unknown, key: string): string | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.length > 0 ? field : undefined;
};

/** Read a finite number field, or undefined when the payload holds something else. */
const numberAt = (value: unknown, key: string): number | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "number" && Number.isFinite(field) ? field : undefined;
};

/** Read an array of endpoint paths, keeping only string members. */
const endpointPaths = (value: unknown): readonly string[] => {
  if (typeof value !== "object" || value === null) return [];
  const field = (value as Record<string, unknown>)["supported_endpoints"];
  if (!Array.isArray(field)) return [];
  return field.filter((item): item is string => typeof item === "string");
};

/**
 * Reduce one `/models` response body to catalog entries. Entries without a
 * usable id, or from a vendor this provider does not serve, are dropped:
 * sending an empty model id would only fail later, and listing another vendor's
 * model under this provider would bill the wrong upstream.
 */
export const parseCatalog = (payload: unknown): CatalogEntry[] => {
  if (typeof payload !== "object" || payload === null) return [];
  const data = (payload as Record<string, unknown>)["data"];
  if (!Array.isArray(data)) return [];
  const entries: CatalogEntry[] = [];
  for (const item of data) {
    const id = stringAt(item, "id");
    if (id === undefined || !isDeepSeekModel(id)) continue;
    const name = stringAt(item, "name");
    const contextLength = numberAt(item, "context_length");
    entries.push({
      id,
      ...(name !== undefined ? { name } : {}),
      ...(contextLength !== undefined ? { contextLength } : {}),
      endpoints: endpointPaths(item),
    });
  }
  return entries;
};

/**
 * Collapse a model id to its vendor-neutral comparable form: the last path
 * segment, lowercased, without punctuation. `moonshotai/Kimi-K3.1-Pro` and
 * `kimi-k3.1-pro` both become `kimik31pro`.
 */
export const normalizeKey = (id: string): string => {
  const tail = id.slice(id.lastIndexOf("/") + 1);
  return tail.toLowerCase().replace(/[^a-z0-9]/gu, "");
};

/**
 * Find every balanced JSON object that starts at a `{"id":"` literal and
 * follows it at least one field deep. The pricing page ships its rates as an
 * escaped JSON array inside an RSC payload, so quote order differs between
 * models and a fixed field-order pattern cannot be relied on.
 */
const jsonObjectsWithId = (text: string): string[] => {
  const found: string[] = [];
  let from = 0;
  for (;;) {
    const start = text.indexOf('{"id":"', from);
    if (start < 0) return found;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          found.push(text.slice(start, index + 1));
          from = index + 1;
          break;
        }
      }
    }
    if (from <= start) return found;
  }
};

/** Unescape the RSC payload's JSON-in-a-string quoting. */
const unescapePayload = (html: string): string =>
  html.replace(/\\\\/gu, "\\").replace(/\\"/gu, '"');

/**
 * Read per-model rates out of the pricing page. A page that no longer carries
 * rates yields an empty list rather than throwing: prices are decoration next
 * to the catalog, and a missing rate must not hide every model.
 */
export const extractPrices = (html: string): Map<string, PriceEntry> => {
  const prices = new Map<string, PriceEntry>();
  for (const object of jsonObjectsWithId(unescapePayload(html))) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(object);
    } catch {
      continue;
    }
    const id = stringAt(parsed, "id");
    const input = numberAt(parsed, "inputCost");
    const output = numberAt(parsed, "outputCost");
    if (id === undefined || input === undefined || output === undefined) continue;
    const cacheRead = numberAt(parsed, "cacheReadCost") ?? 0;
    const cacheWrite = numberAt(parsed, "cacheWriteCost") ?? input;
    prices.set(normalizeKey(id), { input, output, cacheRead, cacheWrite });
  }
  return prices;
};

/**
 * Match a catalog id to a price. The two feeds name models differently —
 * `claude-haiku-4-5-20251001` against `claude-haiku-4-5`, `qwen-3.6-max` against
 * `Qwen/Qwen3.6-Max-Preview` — so an exact normalised hit wins, and otherwise
 * the longest key that contains the other wins.
 */
export const matchPrice = (
  id: string,
  prices: ReadonlyMap<string, PriceEntry>,
): PriceEntry | undefined => {
  const key = normalizeKey(id);
  const exact = prices.get(key);
  if (exact !== undefined) return exact;
  let bestKey = "";
  for (const candidate of prices.keys()) {
    const shorter = Math.min(candidate.length, key.length);
    if (shorter === 0) continue;
    const contains = candidate.startsWith(key) || key.startsWith(candidate);
    if (!contains) continue;
    if (candidate.length > bestKey.length) bestKey = candidate;
  }
  return bestKey.length > 0 ? prices.get(bestKey) : undefined;
};

/** Output limit derived from the context window until the real one is probed. */
const maxTokensFor = (contextWindow: number): number =>
  Math.max(4_096, Math.min(Math.floor(contextWindow / 8), MAX_OUTPUT_CEILING));

/**
 * Turn catalog entries plus prices into pi model definitions. Models without a
 * price keep zero rates so they stay selectable; the footer then understates
 * their cost instead of hiding them.
 *
 * Only DeepSeek models reach this point (the catalog boundary filters), so the
 * capability comes from one constant instead of per-model guesses.
 */
export const toProviderModels = (
  entries: readonly CatalogEntry[],
  prices: ReadonlyMap<string, PriceEntry>,
): ProviderChatModelConfig[] =>
  entries.map((entry) => {
    const price = matchPrice(entry.id, prices);
    const contextWindow = entry.contextLength ?? DEFAULT_CONTEXT_WINDOW;
    return {
      type: "chat",
      id: entry.id,
      name: entry.name ?? entry.id,
      api: "openai-completions",
      baseUrl: OPENAI_BASE_URL,
      ...deepSeekCapability(),
      cost: {
        input: price?.input ?? 0,
        output: price?.output ?? 0,
        cacheRead: price?.cacheRead ?? 0,
        cacheWrite: price?.cacheWrite ?? 0,
      },
      contextWindow,
      maxTokens: maxTokensFor(contextWindow),
    };
  });
