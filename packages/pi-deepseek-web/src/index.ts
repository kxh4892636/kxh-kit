/**
 * pi extension entry point. Registers `web_search` and `web_fetch`, both backed
 * by DeepSeek's official Search and Fetch APIs.
 * @module @kxh4892636/pi-deepseek-web
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { LoadedConfig } from "./config.ts";
import { loadConfig, requireApiKey } from "./config.ts";
import { fetchPage } from "./fetch.ts";
import { formatFetchOutput, formatSearchOutput } from "./format.ts";
import { deepSeekSearch } from "./search.ts";

/** Injectable overrides (tests inject an isolated agent dir and environment). */
export interface DeepSeekWebOptions {
  readonly agentDir?: string;
  readonly env?: NodeJS.ProcessEnv;
}

const configFor = (ctx: ExtensionContext, options: DeepSeekWebOptions): LoadedConfig => {
  return loadConfig({ cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ...options });
};

/** Register `web_search`, whose parameters mirror the official request body. */
const registerSearchTool = (pi: ExtensionAPI, options: DeepSeekWebOptions): void => {
  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web through DeepSeek's official Search API (POST /v1/tools/search). " +
      "Request: { query, count?, ori_question?, localization?, need_content? }. " +
      "Response results: rerank_score, title, url, snippet, summary, content, site_name, site_icon, date, authority. " +
      'Query supports site:, -site:, -, -"...", "...", lang:, after:, before:.',
    promptSnippet: "Search the web via DeepSeek's official Search API.",
    promptGuidelines: [
      'Query supports search operators: site:, -site:, -, -"...", "...", lang:, after: and before:; combine them in one query.',
      "Set need_content=true only when summaries are insufficient; page bodies increase output size.",
      "Set ori_question to the user's original question when query is a keyword rewrite; omit localization unless a specific IP is needed.",
      "Cite the returned source URLs as markdown links; use web_fetch to read a URL without running another search.",
    ],
    parameters: Type.Object({
      query: Type.String({
        minLength: 1,
        description:
          'Search query, 1-128 characters. Supports site:, -site:, -, -"...", "...", lang:, after: and before:.',
      }),
      count: Type.Optional(
        Type.Integer({
          minimum: 1,
          maximum: 50,
          description: "Number of results to return (1-50). Defaults to the configured value.",
        }),
      ),
      ori_question: Type.Optional(
        Type.String({
          minLength: 1,
          description:
            "Original user question that triggered the search, 1-128 characters; helps interpret intent.",
        }),
      ),
      localization: Type.Optional(
        Type.String({
          description: "IP address used to prefer localized results; omit in normal use.",
        }),
      ),
      need_content: Type.Optional(
        Type.Boolean({
          description:
            "Populate each result's content field with the page body. Increases output size; use only when summaries are insufficient.",
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const loaded = configFor(ctx, options);
      const apiKey = requireApiKey(loaded);
      const result = await deepSeekSearch({
        query: params.query,
        apiKey,
        config: loaded.config,
        ...(params.count !== undefined ? { count: params.count } : {}),
        ...(params.ori_question !== undefined ? { ori_question: params.ori_question } : {}),
        ...(params.localization !== undefined ? { localization: params.localization } : {}),
        ...(params.need_content !== undefined ? { need_content: params.need_content } : {}),
        ...(signal !== undefined ? { signal } : {}),
      });
      return {
        content: [{ type: "text" as const, text: formatSearchOutput(result) }],
        details: result,
      };
    },
  });
};

/** Register `web_fetch`, whose request is the official Fetch API's `{ url }`. */
const registerFetchTool = (pi: ExtensionAPI, options: DeepSeekWebOptions): void => {
  pi.registerTool({
    name: "web_fetch",
    label: "Web Fetch",
    description:
      "Fetch a URL through DeepSeek's official Fetch API (POST /v1/tools/fetch). " +
      "Request: { url }. Response: { title, content }, where content is Markdown.",
    promptSnippet: "Fetch one URL through DeepSeek's official Fetch API as Markdown.",
    promptGuidelines: [
      "Use web_fetch when you need the full content of a specific URL, for example a page found through web_search.",
      "Cite the fetched URL as a markdown link in your answer.",
    ],
    parameters: Type.Object({
      url: Type.String({
        maxLength: 8192,
        description:
          "Absolute http(s) URL, up to 8192 characters, with a host and no username/password.",
      }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const loaded = configFor(ctx, options);
      const apiKey = requireApiKey(loaded);
      const page = await fetchPage({
        url: params.url,
        apiKey,
        config: loaded.config,
        ...(signal !== undefined ? { signal } : {}),
      });
      return {
        content: [{ type: "text" as const, text: formatFetchOutput(page) }],
        details: {
          url: page.url,
          ...(page.title !== undefined ? { title: page.title } : {}),
          content: page.content,
          truncated: page.truncated,
        },
      };
    },
  });
};

/** Register the DeepSeek-backed web tools. */
const piDeepSeekWeb = (pi: ExtensionAPI, options: DeepSeekWebOptions = {}): void => {
  registerSearchTool(pi, options);
  registerFetchTool(pi, options);
};

export default piDeepSeekWeb;
