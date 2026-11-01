import { describe, expect, it } from "vitest";
import { apiUrl, appUrl } from "./url.ts";

describe("appUrl", () => {
  it("keeps the base prefix and strips leading slashes", () => {
    // BASE_URL is "/" under vitest, so the join is a plain concatenation.
    expect(appUrl("media/a.flac")).toBe("/media/a.flac");
    expect(appUrl("/media/a.flac")).toBe("/media/a.flac");
    expect(apiUrl("/api/tracks")).toBe("/api/tracks");
  });
});
