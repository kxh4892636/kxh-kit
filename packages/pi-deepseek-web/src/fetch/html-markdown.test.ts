import { describe, expect, it } from "vitest";

import { convertHtmlToMarkdown } from "./html-markdown.js";

describe("HTML to safe Markdown", (): void => {
  it("converts GFM structures and resolves safe relative links", (): void => {
    const result = convertHtmlToMarkdown(
      `<h1>Result</h1><table><tr><th>Name</th></tr><tr><td>A</td></tr></table>
       <ul><li><input type="checkbox" checked> done</li></ul>
       <a href="/detail?q=1">details</a>`,
      "https://example.com/base/",
    );

    expect(result.omitted).toBe(false);
    expect(result.markdown).toContain("# Result");
    expect(result.markdown).toContain("| Name |");
    expect(result.markdown).toContain("[details](<https://example.com/detail?q=1>)");
  });

  it("removes active, form, image, and hidden content", (): void => {
    const result = convertHtmlToMarkdown(
      `<main>visible<script>steal()</script><style>.x{}</style><form>secret form</form>
       <img src="https://tracker.example/pixel" alt="tracker">
       <p hidden>hidden one</p><p aria-hidden="TRUE">hidden two</p>
       <p style="DISPLAY: none !important">hidden three</p>
       <a hidden href="/hidden-link">hidden link</a></main>`,
      "https://example.com/",
    );

    expect(result.markdown).toContain("visible");
    expect(result.markdown).not.toMatch(
      /steal|secret form|tracker|hidden one|hidden two|hidden three|hidden link/u,
    );
  });

  it("renders unsafe or credential-bearing links as plain text", (): void => {
    const result = convertHtmlToMarkdown(
      `<a href="javascript:alert(1)">bad</a>
       <a href="https://user:pass@example.com/private">credentialed</a>
       <a href="mailto:x@example.com">mail</a>`,
      "https://example.com/",
    );

    expect(result.markdown).toContain("bad");
    expect(result.markdown).toContain("credentialed");
    expect(result.markdown).toContain("mail");
    expect(result.markdown).not.toContain("](");
  });

  it("omits HTML that exceeds the conversion depth guard", (): void => {
    const html = `${"<div>".repeat(513)}never expose raw HTML${"</div>".repeat(513)}`;
    const result = convertHtmlToMarkdown(html, "https://example.com/");

    expect(result).toEqual({
      markdown: "[HTML content omitted: unable to convert safely.]",
      omitted: true,
    });
    expect(result.markdown).not.toContain("never expose raw HTML");
  });
});
