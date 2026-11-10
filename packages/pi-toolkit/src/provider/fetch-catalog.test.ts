import { describe, expect, it, vi } from "vite-plus/test";
import { MODELS_URL, PRICING_URL } from "./commandcode.ts";
import { fetchCatalog, fetchPrices, loadCommandCodeModels } from "./fetch-catalog.ts";

const catalogBody = {
  object: "list",
  data: [
    {
      id: "claude-sonnet-5",
      name: "Claude Sonnet 5",
      context_length: 1_000_000,
      supported_endpoints: ["/messages"],
    },
    {
      id: "deepseek/deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      context_length: 1_000_000,
      supported_endpoints: ["/chat/completions"],
    },
  ],
};

/** Read the request URL without relying on `String(Request)` semantics. */
const urlOf = (input: Parameters<typeof fetch>[0]): string => {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const htmlResponse = (body: string, status = 200): Response =>
  new Response(body, { status, headers: { "content-type": "text/html" } });

/** Route the two upstream calls by URL, so a test names only the one it cares about. */
const routeFetch = (routes: { models?: () => Response; pricing?: () => Response }): typeof fetch =>
  vi.fn<typeof fetch>(async (input) => {
    const url = urlOf(input);
    if (url === MODELS_URL && routes.models !== undefined) return routes.models();
    if (url === PRICING_URL && routes.pricing !== undefined) return routes.pricing();
    return jsonResponse({ error: "unexpected url" }, 500);
  });

describe("fetchCatalog", () => {
  it("requests the catalog endpoint and normalises the DeepSeek models", async () => {
    const fetchImpl = routeFetch({ models: () => jsonResponse(catalogBody) });
    const entries = await fetchCatalog({ fetchImpl });
    // claude-sonnet-5 在同一个响应里，但 provider 只上架 deepseek。
    expect(entries.map((entry) => entry.id)).toEqual(["deepseek/deepseek-v4-flash"]);
    expect(entries[0]?.endpoints).toEqual(["/chat/completions"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fails when the catalog lists no DeepSeek model", async () => {
    const onlyOtherVendors = routeFetch({
      models: () =>
        jsonResponse({
          data: [
            {
              id: "claude-sonnet-5",
              name: "Claude Sonnet 5",
              supported_endpoints: ["/messages"],
            },
          ],
        }),
    });
    await expect(fetchCatalog({ fetchImpl: onlyOtherVendors })).rejects.toThrow(/no models/u);
  });

  it("names the endpoint when the response is an error", async () => {
    const fetchImpl = routeFetch({ models: () => jsonResponse({ error: "nope" }, 502) });
    await expect(fetchCatalog({ fetchImpl })).rejects.toThrow(/HTTP 502/u);
    await expect(fetchCatalog({ fetchImpl })).rejects.toThrow(MODELS_URL);
  });

  it("rejects unreadable JSON and an empty model list", async () => {
    const garbage = vi.fn<typeof fetch>(async () => new Response("not json", { status: 200 }));
    await expect(fetchCatalog({ fetchImpl: garbage })).rejects.toThrow(/unreadable JSON/u);
    const empty = routeFetch({ models: () => jsonResponse({ data: [] }) });
    await expect(fetchCatalog({ fetchImpl: empty })).rejects.toThrow(/no models/u);
  });
});

describe("fetchPrices", () => {
  it("reads rates out of the pricing page", async () => {
    const fetchImpl = routeFetch({
      pricing: () =>
        htmlResponse(
          'self.__next_f.push([1,"[{\\"id\\":\\"a\\",\\"inputCost\\":1,\\"outputCost\\":2}]"])',
        ),
    });
    const prices = await fetchPrices({ fetchImpl });
    expect(prices.get("a")).toEqual({ input: 1, output: 2, cacheRead: 0, cacheWrite: 1 });
  });

  it("degrades to no prices instead of failing the refresh", async () => {
    const unreachable = vi.fn<typeof fetch>(async () => {
      throw new Error("offline");
    });
    await expect(fetchPrices({ fetchImpl: unreachable })).resolves.toEqual(new Map());
    const broken = routeFetch({ pricing: () => htmlResponse("gone", 404) });
    await expect(fetchPrices({ fetchImpl: broken })).resolves.toEqual(new Map());
  });
});

describe("loadCommandCodeModels", () => {
  it("joins the catalog with the rates", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      if (urlOf(input) === MODELS_URL) return jsonResponse(catalogBody);
      if (urlOf(input) === PRICING_URL) {
        return htmlResponse(
          'self.__next_f.push([1,"[{\\"id\\":\\"deepseek-v4-flash\\",\\"inputCost\\":0.15,\\"outputCost\\":0.6}]"])',
        );
      }
      return jsonResponse({}, 500);
    });
    const models = await loadCommandCodeModels({ fetchImpl });
    expect(models.map((model) => model.id)).toEqual(["deepseek/deepseek-v4-flash"]);
    expect(models[0]?.cost.input).toBe(0.15);
    expect(models[0]?.cost.output).toBe(0.6);
  });

  it("still returns the catalog when pricing cannot be reached", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      if (urlOf(input) === MODELS_URL) return jsonResponse(catalogBody);
      throw new Error("offline");
    });
    const models = await loadCommandCodeModels({ fetchImpl });
    expect(models).toHaveLength(1);
    expect(models[0]?.cost.input).toBe(0);
  });
});
