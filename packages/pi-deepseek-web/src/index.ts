/**
 * pi extension entry point. Registers `web_search` (DeepSeek's native Anthropic
 * web-search tool) and `web_fetch` (direct HTTP retrieval).
 * @module @kxh4892636/pi-deepseek-web
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadConfig, requireApiKey } from "./config.ts";
import { fetchPage } from "./fetch.ts";
import { formatFetchOutput, formatSearchOutput } from "./format.ts";
import { deepSeekSearch } from "./search.ts";

/** Injectable overrides (tests inject an isolated agent dir and environment). */
export interface DeepSeekWebOptions {
  readonly agentDir?: string;
  readonly env?: NodeJS.ProcessEnv;
}

const configFor = (ctx: ExtensionContext, options: DeepSeekWebOptions) => {
  return loadConfig({ cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ...options });
};

/** Register the DeepSeek-backed web tools. */
export default function piDeepSeekWeb(pi: ExtensionAPI, options: DeepSeekWebOptions = {}): void {
  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web for current information through DeepSeek. Returns an optional summary answer and a list of source URLs.",
    promptSnippet: "Search the web via DeepSeek and return an answer plus source URLs.",
    promptGuidelines: [
      "Use web_search when the user asks for current web information; cite the returned source URLs as markdown links.",
      "Use web_fetch to read a specific URL found through web_search.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "The search query." }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const loaded = configFor(ctx, options);
      const apiKey = requireApiKey(loaded);
      const result = await deepSeekSearch({
        query: params.query,
        apiKey,
        config: loaded.config,
        ...(signal !== undefined ? { signal } : {}),
      });
      return {
        content: [{ type: "text" as const, text: formatSearchOutput(result) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "web_fetch",
    label: "Web Fetch",
    description:
      "Fetch a URL over HTTP(S) and return readable content. HTML is converted to GitHub-flavored markdown.",
    promptSnippet: "Fetch one URL and return its readable content as markdown or text.",
    promptGuidelines: [
      "Use web_fetch when you need the full content of a specific URL, for example a page found through web_search.",
      "Cite the fetched URL as a markdown link in your answer.",
    ],
    parameters: Type.Object({
      url: Type.String({ description: "Absolute http(s) URL to fetch." }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const loaded = configFor(ctx, options);
      const page = await fetchPage({
        url: params.url,
        config: {
          maxResponseBytes: loaded.config.fetchMaxResponseBytes,
          maxBodyChars: loaded.config.fetchMaxBodyChars,
          timeoutMs: loaded.config.fetchTimeoutMs,
        },
        ...(signal !== undefined ? { signal } : {}),
      });
      return {
        content: [{ type: "text" as const, text: formatFetchOutput(page) }],
        details: {
          url: page.url,
          statusCode: page.statusCode,
          contentType: page.contentType,
          truncated: page.truncated,
        },
      };
    },
  });
}
