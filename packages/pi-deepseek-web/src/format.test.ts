import { describe, expect, it } from "vitest";
import { formatFetchOutput, formatSearchOutput, sourceLabel } from "./format.ts";

describe("sourceLabel", () => {
  it("prefers the title, then the hostname, then the raw URL", () => {
    expect(sourceLabel("https://example.com/a", "Title")).toBe("Title");
    expect(sourceLabel("https://example.com/a", undefined)).toBe("example.com");
    expect(sourceLabel("not a url", undefined)).toBe("not a url");
  });
});

describe("formatSearchOutput", () => {
  it("renders the answer, sources, and citation instruction", () => {
    const text = formatSearchOutput({
      answer: "Answer body",
      sources: [
        { url: "https://a.example", title: "A", snippet: "snip", publishedAt: "2026-01-01" },
        { url: "https://b.example" },
      ],
      truncated: false,
    });
    expect(text).toContain("Answer body");
    expect(text).toContain("- [A](https://a.example) — snip (2026-01-01)");
    expect(text).toContain("- [b.example](https://b.example)");
    expect(text).toContain("Cite the relevant URLs");
  });

  it("reports an empty result", () => {
    expect(formatSearchOutput({ sources: [], truncated: false })).toContain("No results found.");
  });
});

describe("formatFetchOutput", () => {
  it("renders the response head, body, and truncation note", () => {
    const text = formatFetchOutput({
      url: "https://a.example",
      statusCode: 200,
      contentType: "text/html",
      kind: "html",
      content: "# Title",
      truncated: true,
    });
    expect(text).toContain("URL: https://a.example");
    expect(text).toContain("HTTP status: 200");
    expect(text).toContain("# Title");
    expect(text).toContain("truncated");
  });

  it("labels an empty body", () => {
    const text = formatFetchOutput({
      url: "https://a.example",
      statusCode: 204,
      contentType: null,
      kind: "text",
      content: "   ",
      truncated: false,
    });
    expect(text).toContain("(empty body)");
    expect(text).toContain("Content-Type: unknown");
  });
});
