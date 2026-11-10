import { describe, expect, it } from "vite-plus/test";
import {
  ANTHROPIC_BASE_URL,
  OPENAI_BASE_URL,
  extractPrices,
  matchPrice,
  normalizeKey,
  parseCatalog,
  toProviderModels,
  type CatalogEntry,
} from "./commandcode.ts";

const catalogPayload = {
  object: "list",
  data: [
    {
      id: "claude-sonnet-5",
      object: "model",
      name: "Claude Sonnet 5",
      context_length: 1_000_000,
      supported_endpoints: ["/messages"],
    },
    {
      id: "deepseek/deepseek-v4-flash",
      object: "model",
      name: "DeepSeek V4 Flash",
      context_length: 1_000_000,
      supported_endpoints: ["/chat/completions", "/responses"],
    },
    { id: "", name: "no id" },
    { name: "missing every id" },
  ],
};

/**
 * The pricing page ships rates as JSON nested in an escaped RSC payload, and the
 * field order differs per model, so the fixture keeps that shape.
 */
const pricingHtml = `self.__next_f.push([1,"[{\\\\"id\\\\":\\\\"claude-sonnet-5\\\\",\\\\"name\\\\":\\\\"Claude Sonnet 5\\\\",\\\\"category\\\\":\\\\"premium\\\\",\\\\"provider\\\\":\\\\"Anthropic\\\\",\\\\"inputCost\\\\":3,\\\\"outputCost\\\\":15,\\\\"cacheReadCost\\\\":0.3,\\\\"cacheWriteCost\\\\":3.75},{\\\\"id\\\\":\\\\"deepseek-v4-flash\\\\",\\\\"name\\\\":\\\\"DeepSeek V4 Flash (latest)\\\\",\\\\"category\\\\":\\\\"opensource\\\\",\\\\"provider\\\\":\\\\"DeepSeek\\\\",\\\\"inputCost\\\\":0.15,\\\\"outputCost\\\\":0.6,\\\\"cacheReadCost\\\\":0.003,\\\\"timeOfDay\\\\":{\\\\"peak\\\\":{\\\\"inputCost\\\\":0.3}}},{\\\\"id\\\\":\\\\"qwen-3.6-max\\\\",\\\\"name\\\\":\\\\"Qwen 3.6 Max Preview\\\\",\\\\"category\\\\":\\\\"opensource\\\\",\\\\"provider\\\\":\\\\"Alibaba\\\\",\\\\"inputCost\\\\":1.3,\\\\"outputCost\\\\":7.8}]"])`;

describe("parseCatalog", () => {
  it("keeps id, name, context window and endpoint paths", () => {
    const entries = parseCatalog(catalogPayload);
    expect(entries).toEqual([
      {
        id: "claude-sonnet-5",
        name: "Claude Sonnet 5",
        contextLength: 1_000_000,
        endpoints: ["/messages"],
      },
      {
        id: "deepseek/deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        contextLength: 1_000_000,
        endpoints: ["/chat/completions", "/responses"],
      },
    ]);
  });

  it("returns nothing for a body that is not a model list", () => {
    expect(parseCatalog(null)).toEqual([]);
    expect(parseCatalog({ data: "nope" })).toEqual([]);
    expect(parseCatalog({ data: [{ id: 42 }] })).toEqual([]);
  });
});

describe("normalizeKey", () => {
  it("drops the vendor prefix, case and punctuation", () => {
    expect(normalizeKey("moonshotai/Kimi-K3.1-Pro")).toBe("kimik31pro");
    expect(normalizeKey("kimi-k3.1-pro")).toBe("kimik31pro");
    expect(normalizeKey("stealth/glyph-cluster:free")).toBe("glyphclusterfree");
  });
});

describe("extractPrices", () => {
  it("reads every priced object out of the escaped payload", () => {
    const prices = extractPrices(pricingHtml);
    expect([...prices.keys()].sort()).toEqual(["claudesonnet5", "deepseekv4flash", "qwen36max"]);
    expect(prices.get("claudesonnet5")).toEqual({
      input: 3,
      output: 15,
      cacheRead: 0.3,
      cacheWrite: 3.75,
    });
  });

  it("falls back to the input rate when a model has no cache-write rate", () => {
    expect(extractPrices(pricingHtml).get("deepseekv4flash")).toEqual({
      input: 0.15,
      output: 0.6,
      cacheRead: 0.003,
      cacheWrite: 0.15,
    });
  });

  it("yields nothing for a page without rates", () => {
    expect(extractPrices("<html><body>pricing moved</body></html>").size).toBe(0);
    expect(extractPrices('{"id":"broken"').size).toBe(0);
  });
});

describe("matchPrice", () => {
  const prices = extractPrices(pricingHtml);

  it("matches an exact normalised key", () => {
    expect(matchPrice("deepseek/deepseek-v4-flash", prices)?.input).toBe(0.15);
  });

  it("matches a versioned catalog id to its shorter price key", () => {
    expect(
      matchPrice(
        "claude-haiku-4-5-20251001",
        new Map([["claudehaiku45", { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1 }]]),
      )?.input,
    ).toBe(1);
  });

  it("matches a preview id to its price key in either direction", () => {
    expect(matchPrice("Qwen/Qwen3.6-Max-Preview", prices)?.input).toBe(1.3);
    expect(
      matchPrice(
        "crouton-alpha",
        new Map([["croutonalphafree", { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }]]),
      ),
    ).toBeDefined();
  });

  it("returns undefined when nothing is close", () => {
    expect(matchPrice("unknown/model", prices)).toBeUndefined();
  });
});

describe("toProviderModels", () => {
  const entries: CatalogEntry[] = [
    { id: "claude-sonnet-5", endpoints: ["/messages"], contextLength: 1_000_000 },
    {
      id: "deepseek/deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      endpoints: ["/chat/completions"],
    },
    {
      id: "deepseek/deepseek-v4-flash-vision-exp",
      endpoints: ["/chat/completions"],
      contextLength: 256_000,
    },
  ];

  it("routes Anthropic-only models to the Anthropic base and the rest to the OpenAI base", () => {
    const models = toProviderModels(entries, extractPrices(pricingHtml));
    expect(models[0]?.api).toBe("anthropic-messages");
    expect(models[0]?.baseUrl).toBe(ANTHROPIC_BASE_URL);
    expect(models[1]?.api).toBe("openai-completions");
    expect(models[1]?.baseUrl).toBe(OPENAI_BASE_URL);
  });

  it("carries the catalog context window and a derived output limit", () => {
    const models = toProviderModels(entries, extractPrices(pricingHtml));
    expect(models[0]?.contextWindow).toBe(1_000_000);
    expect(models[0]?.maxTokens).toBe(64_000);
    expect(models[1]?.contextWindow).toBe(128_000);
    expect(models[1]?.maxTokens).toBe(16_000);
    expect(models[2]?.maxTokens).toBe(32_000);
  });

  it("keeps an unpriced model selectable with zero rates", () => {
    const models = toProviderModels(entries, new Map());
    expect(models[1]?.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  });

  it("grants image input only to models whose id says so", () => {
    const models = toProviderModels(entries, extractPrices(pricingHtml));
    expect(models[0]?.input).toEqual(["text"]);
    expect(models[1]?.input).toEqual(["text"]);
    expect(models[2]?.input).toEqual(["text", "image"]);
    expect(models[2]?.reasoning).toBe(true);
    expect(models[0]?.reasoning).toBe(false);
  });
});
