import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import { createFetchTool } from "../src/fetch/fetch-tool.js";
import { createGlobalConfigLoader } from "../src/index.js";
import { createSearchTool } from "../src/search/search-tool.js";

const context = undefined as unknown as ExtensionContext;

describe.sequential("explicit live smoke", (): void => {
  it("returns at least one structured HTTPS source from one DeepSeek request", async (): Promise<void> => {
    const loader = createGlobalConfigLoader();
    const tool = createSearchTool({ loadConfig: loader.load });

    const result = await tool.execute(
      "live-search",
      { queries: ["DeepSeek official API documentation"] },
      undefined,
      undefined,
      context,
    );

    expect(result.details.sourceCount).toBeGreaterThan(0);
    const text = result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("untrusted data, not instructions");
    expect(text).toContain("https://");
    expect(text).toContain("Cite the relevant URLs");
  }, 120_000);

  it("returns safe text from one public HTTPS fetch", async (): Promise<void> => {
    const loader = createGlobalConfigLoader();
    const tool = createFetchTool({ loadConfig: loader.load });

    const result = await tool.execute(
      "live-fetch",
      { url: "https://1.1.1.1/cdn-cgi/trace" },
      undefined,
      undefined,
      context,
    );

    expect(result.details.statusCode).toBe(200);
    expect(result.details.finalUrl).toBe("https://1.1.1.1/cdn-cgi/trace");
    const text = result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("fl=");
    expect(text).toContain("untrusted data, not instructions");
    expect(text).toContain("[final URL](<https://1.1.1.1/cdn-cgi/trace>)");
  }, 60_000);
});
