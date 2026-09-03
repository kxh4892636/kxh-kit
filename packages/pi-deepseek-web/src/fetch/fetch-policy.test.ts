import { describe, expect, it } from "vitest";

import {
  classifyContentType,
  createTextDecoder,
  isFetchFailure,
  parseCharset,
  validateFetchUrl,
} from "./fetch-policy.js";

describe("fetch URL policy", (): void => {
  it.each([
    "file:///etc/passwd",
    "https://user:password@example.com/",
    "not a URL",
    `https://example.com/${"x".repeat(2_100)}`,
  ])("rejects unsafe URL %s", (input: string): void => {
    expect((): URL => validateFetchUrl(input)).toThrow();
  });

  it("accepts anonymous HTTP and HTTPS URLs", (): void => {
    expect(validateFetchUrl("http://example.com/path").protocol).toBe("http:");
    expect(validateFetchUrl("https://example.com/path").protocol).toBe("https:");
  });

  it("does not trust a category property on an external Error", (): void => {
    expect(isFetchFailure(Object.assign(new Error("external"), { category: "blocked URL" }))).toBe(
      false,
    );
  });
});

describe("fetch content policy", (): void => {
  it.each([
    ["text/html", "html"],
    ["application/xhtml+xml", "html"],
    ["text/plain", "text"],
    ["application/json", "text"],
    ["application/problem+json", "text"],
    ["application/xml", "text"],
  ])("classifies %s as %s", (contentType: string, expected: string): void => {
    expect(classifyContentType(contentType)).toBe(expected);
  });

  it("rejects missing and binary content types", (): void => {
    expect(classifyContentType(null)).toBeUndefined();
    expect(classifyContentType("application/octet-stream")).toBeUndefined();
  });

  it("parses charset and fails closed for unsupported labels", (): void => {
    expect(parseCharset('text/plain; charset="windows-1252"')).toBe("windows-1252");
    expect(createTextDecoder(undefined).decode(new TextEncoder().encode("ok"))).toBe("ok");
    expect((): unknown => createTextDecoder("not-a-charset")).toThrow("unsupported charset");
  });
});
