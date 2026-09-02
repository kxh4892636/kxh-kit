import { gfm } from "@joplin/turndown-plugin-gfm";
import TurndownService from "turndown";

const OMITTED_HTML = "[HTML content omitted: unable to convert safely.]";
const MAX_CONVERSION_DEPTH = 512;
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
const RAW_TEXT_ELEMENTS = new Set(["script", "style", "noscript"]);
const REMOVED_ELEMENTS = new Set([
  "BUTTON",
  "CANVAS",
  "EMBED",
  "FORM",
  "IFRAME",
  "IMG",
  "INPUT",
  "LINK",
  "META",
  "NOSCRIPT",
  "OBJECT",
  "OPTION",
  "SCRIPT",
  "SELECT",
  "STYLE",
  "SVG",
  "TEMPLATE",
  "TEXTAREA",
]);

export interface MarkdownConversion {
  readonly markdown: string;
  readonly omitted: boolean;
}

const isTagBoundary = (character: string | undefined): boolean =>
  character === undefined || character === ">" || character === "/" || /\s/u.test(character);

const findRawTextEnd = (lowerHtml: string, name: string, from: number): number => {
  const prefix = `</${name}`;
  let candidate = lowerHtml.indexOf(prefix, from);
  while (candidate !== -1 && !isTagBoundary(lowerHtml[candidate + prefix.length])) {
    candidate = lowerHtml.indexOf(prefix, candidate + prefix.length);
  }
  return candidate;
};

const readTagEnd = (html: string, start: number): number => {
  let quote: '"' | "'" | undefined;
  for (let cursor = start; cursor < html.length; cursor += 1) {
    const character = html[cursor];
    if (quote !== undefined) {
      if (character === quote) {
        quote = undefined;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return cursor;
    }
  }
  return -1;
};

const exceedsConversionDepth = (html: string): boolean => {
  const lowerHtml = html.toLowerCase();
  const openElements: string[] = [];
  let offset = 0;
  while (offset < html.length) {
    const start = html.indexOf("<", offset);
    if (start === -1) {
      return false;
    }
    if (html.startsWith("<!--", start)) {
      const commentEnd = html.indexOf("-->", start + 4);
      offset = commentEnd === -1 ? html.length : commentEnd + 3;
      continue;
    }
    let cursor = start + 1;
    const closing = html[cursor] === "/";
    cursor += closing ? 1 : 0;
    const nameStart = cursor;
    while (/[a-zA-Z0-9-]/u.test(html[cursor] ?? "")) {
      cursor += 1;
    }
    const tagEnd = readTagEnd(html, cursor);
    if (cursor === nameStart || tagEnd === -1) {
      offset = start + 1;
      continue;
    }
    const name = lowerHtml.slice(nameStart, cursor);
    if (closing) {
      if (openElements.at(-1) === name) {
        openElements.pop();
      }
    } else if (!VOID_ELEMENTS.has(name) && html[tagEnd - 1] !== "/") {
      openElements.push(name);
      if (openElements.length > MAX_CONVERSION_DEPTH) {
        return true;
      }
      if (RAW_TEXT_ELEMENTS.has(name)) {
        const rawEnd = findRawTextEnd(lowerHtml, name, tagEnd + 1);
        if (rawEnd === -1) {
          return false;
        }
        offset = rawEnd;
        continue;
      }
    }
    offset = tagEnd + 1;
  }
  return false;
};

const hiddenByStyle = (style: string | null): boolean =>
  (style ?? "").split(";").some((declaration: string): boolean => {
    const separator = declaration.indexOf(":");
    if (separator === -1) {
      return false;
    }
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration
      .slice(separator + 1)
      .trim()
      .toLowerCase()
      .replace(/\s*!important\s*$/u, "");
    return (
      (property === "display" && value === "none") ||
      (property === "visibility" && ["hidden", "collapse"].includes(value)) ||
      (property === "opacity" && value === "0")
    );
  });

const shouldRemoveNode = (node: HTMLElement): boolean =>
  REMOVED_ELEMENTS.has(node.nodeName) ||
  node.hasAttribute("hidden") ||
  node.getAttribute("aria-hidden")?.toLowerCase() === "true" ||
  hiddenByStyle(node.getAttribute("style"));

const safeLinkTarget = (href: string | null, baseUrl: string): string | undefined => {
  if (href === null || href.length === 0) {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(href, baseUrl);
  } catch {
    return undefined;
  }
  if (
    !(["http:", "https:"] as string[]).includes(url.protocol) ||
    url.username !== "" ||
    url.password !== ""
  ) {
    return undefined;
  }
  return url.toString();
};

const createConverter = (baseUrl: string): TurndownService => {
  const converter = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  converter.use(gfm);
  converter.addRule("safeLinks", {
    filter: "a",
    replacement: (
      content: string,
      node: HTMLElement,
      _options: TurndownService.Options,
    ): string => {
      const target = safeLinkTarget(node.getAttribute("href"), baseUrl);
      return target === undefined || content.length === 0 ? content : `[${content}](<${target}>)`;
    },
  });
  converter.addRule("removeActiveAndHiddenContent", {
    filter: (node: HTMLElement, _options: TurndownService.Options): boolean =>
      shouldRemoveNode(node),
    replacement: (): string => "",
  });
  return converter;
};

export const convertHtmlToMarkdown = (html: string, baseUrl: string): MarkdownConversion => {
  if (exceedsConversionDepth(html)) {
    return { markdown: OMITTED_HTML, omitted: true };
  }
  try {
    return { markdown: createConverter(baseUrl).turndown(html), omitted: false };
  } catch {
    return { markdown: OMITTED_HTML, omitted: true };
  }
};
