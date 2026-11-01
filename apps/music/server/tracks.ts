import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { librarySchema, type Library } from "../shared/tracks.ts";

export interface LibrarySnapshot {
  library: Library;
  etag: string;
  bytes: number;
}

/**
 * Read and validate the index once at boot. The file is a build artifact that
 * lives outside the client bundle, so a malformed edit must fail loudly here
 * rather than reach the browser.
 */
export const loadLibrary = (file: string): LibrarySnapshot => {
  const raw = readFileSync(file);
  const parsed = librarySchema.safeParse(JSON.parse(raw.toString("utf8")));
  if (!parsed.success) {
    throw new Error(
      `曲目索引不合法：${file}\n${parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("\n")}`,
    );
  }
  const etag = `"${createHash("sha1").update(raw).digest("hex")}"`;
  return { library: parsed.data, etag, bytes: raw.byteLength };
};
