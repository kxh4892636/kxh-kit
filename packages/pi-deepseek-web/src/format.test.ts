import { describe, expect, it } from "vite-plus/test";
import { formatFetchOutput, formatSearchOutput, sourceLabel } from "./format.ts";

describe("sourceLabel", () => {
  it("prefers the title, then the hostname, then the raw URL", () => {
    expect(sourceLabel("https://example.com/a", "Title")).toBe("Title");
    expect(sourceLabel("https://example.com/a", undefined)).toBe("example.com");
    expect(sourceLabel("not a url", undefined)).toBe("not a url");
  });
});

describe("formatSearchOutput", () => {
  it("renders summary, ranking metadata, site, date and content", () => {
    const text = formatSearchOutput({
      count: 1,
      results: [
        {
          rerank_score: 2.4,
          authority: 3,
          title: "A",
          url: "https://a.example",
          summary: "long A",
          site_name: "Site A",
          date: "2026-01-01",
          content: "body A",
        },
      ],
    });
    expect(text).toContain(
      "- [A](https://a.example) — long A (score 2.4, authority 3, Site A, 2026-01-01)",
    );
    expect(text).toContain("Content:\nbody A");
    expect(text).toContain("Cite the relevant URLs");
  });

  it("falls back to snippet and skips null metadata", () => {
    const text = formatSearchOutput({
      count: 1,
      results: [{ url: "https://a.example", snippet: "short A", site_name: null, date: null }],
    });
    expect(text).toContain("- [a.example](https://a.example) — short A");
    expect(text).not.toContain("null");
  });

  it("labels the unknown authority sentinel and escapes markdown link characters", () => {
    const text = formatSearchOutput({
      count: 1,
      results: [
        {
          title: "A ] (B)\nnext",
          url: "https://a.example/x_(y)",
          authority: -1,
        },
      ],
    });
    expect(text).toContain("authority unknown");
    expect(text).toContain("- [A \\] (B) next](https://a.example/x_%28y%29)");
  });

  it("reports an empty result", () => {
    const text = formatSearchOutput({ count: 10, results: [] });
    expect(text).toContain("No results found.");
    expect(text).toContain("Cite the relevant URLs");
  });

  it("skips results without a URL", () => {
    const text = formatSearchOutput({ count: 1, results: [{ title: "No URL" }] });
    expect(text).toContain("No results found.");
  });
});

describe("formatFetchOutput", () => {
  it("renders the URL, title, body, and truncation note", () => {
    const text = formatFetchOutput({
      url: "https://a.example",
      title: "Page title",
      content: "# Title",
      truncated: true,
    });
    expect(text).toContain("URL: https://a.example");
    expect(text).toContain("Title: Page title");
    expect(text).toContain("# Title");
    expect(text).toContain("truncated");
  });

  it("omits the title and labels an empty body", () => {
    const text = formatFetchOutput({
      url: "https://a.example",
      content: "   ",
      truncated: false,
    });
    expect(text).toContain("URL: https://a.example");
    expect(text).not.toContain("Title:");
    expect(text).toContain("(empty body)");
  });
});
