import * as dns from "node:dns";
import { resolve } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Logger } from "../logger";
import {
  MediaUrlInvalidError,
  mediaFileConfig,
  mediaUrlConfig,
  sanitizeMediaFilename,
  validateMediaFilePath,
  validateMediaUrl,
  validateMediaUrlSyntax,
} from "./media-validation";

const lookup = (addresses: readonly string[]): void => {
  vi.spyOn(dns.promises, "lookup").mockResolvedValue(
    addresses.map((address: string) => ({
      address,
      family: address.includes(":") ? 6 : 4,
    })) as never,
  );
};

const capturedError = (operation: () => unknown): Error => {
  try {
    operation();
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error("Expected operation to throw an Error");
};

afterEach((): void => {
  vi.restoreAllMocks();
});

describe("media validation boundaries", (): void => {
  test("parses optional media configuration and removes empty list entries", (): void => {
    expect(mediaFileConfig({})).toEqual({});
    expect(
      mediaFileConfig({
        MEDIA_ALLOWED_TYPES: " text/plain, ,application/pdf ",
        MEDIA_IMPORT_DIR: "in",
      }),
    ).toEqual({ allowedTypes: ["text/plain", "application/pdf"], importDir: "in" });
    expect(mediaUrlConfig({})).toEqual({});
    expect(mediaUrlConfig({ MEDIA_ALLOWED_HOSTS: " localhost, ,127.0.0.1 " })).toEqual({
      allowedHosts: ["localhost", "127.0.0.1"],
    });
  });

  test("accepts default media MIME types and configured extra types", (): void => {
    expect(validateMediaFilePath("photo.png", {})).toMatchObject({ mimeType: "image/png" });
    expect(validateMediaFilePath("notes.txt", { allowedTypes: ["text/plain"] })).toMatchObject({
      mimeType: "text/plain",
    });
  });

  test.each(["notes.txt", "unknown.no-such-extension", "bad\0.png"])(
    "rejects a disallowed local file %s",
    (file: string): void => {
      expect(capturedError(() => validateMediaFilePath(file, {}))).toMatchObject({
        name: "MediaFileTypeError",
        message:
          "File type not allowed. Only media files (images, audio, video) are accepted. To allow additional file types, set the MEDIA_ALLOWED_TYPES environment variable.",
      });
    },
  );

  test("enforces the configured import directory", (): void => {
    const directory = resolve("media-import");
    expect(
      validateMediaFilePath(resolve(directory, "inside.png"), { importDir: directory }),
    ).toMatchObject({
      resolvedPath: resolve(directory, "inside.png"),
    });
    expect(
      capturedError(() => validateMediaFilePath(resolve("outside.png"), { importDir: directory })),
    ).toMatchObject({
      name: "MediaImportDirError",
      message: `File path is outside the allowed import directory (${directory}). Update MEDIA_IMPORT_DIR to change the allowed directory.`,
    });
  });

  test.each(["not a url", "://missing"])("rejects invalid URL syntax", (url: string): void => {
    expect(capturedError(() => validateMediaUrlSyntax(url))).toMatchObject({
      name: "MediaUrlInvalidError",
      message: "Invalid URL provided.",
    });
  });

  test.each([
    ["file:///tmp/a.png", "file"],
    ["ftp://example.com/a.png", "ftp"],
  ])("rejects the URL scheme in %s", (url: string, scheme: string): void => {
    expect(capturedError(() => validateMediaUrlSyntax(url))).toMatchObject({
      name: "MediaUrlSchemeError",
      message: `URL scheme "${scheme}" is not allowed. Only http: and https: URLs are accepted.`,
    });
  });

  test("accepts HTTP and HTTPS syntax", (): void => {
    expect(validateMediaUrlSyntax("http://example.com/a").protocol).toBe("http:");
    expect(validateMediaUrlSyntax("https://example.com/a").protocol).toBe("https:");
  });

  test.each([new Error("dns down"), "dns down"])(
    "logs and normalizes DNS failures",
    async (failure: unknown): Promise<void> => {
      vi.spyOn(dns.promises, "lookup").mockRejectedValue(failure);
      const logger: Logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };
      await expect(validateMediaUrl("https://example.com/a", {}, logger)).rejects.toBeInstanceOf(
        MediaUrlInvalidError,
      );
      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        'Unable to resolve media host "example.com": dns down',
      );
    },
  );

  test("rejects an empty DNS result", async (): Promise<void> => {
    lookup([]);
    await expect(validateMediaUrl("https://example.com/a", {})).rejects.toBeInstanceOf(
      MediaUrlInvalidError,
    );
  });

  test("allows a private address by hostname allowlist", async (): Promise<void> => {
    lookup(["127.0.0.1"]);
    await expect(
      validateMediaUrl("https://private.example/a", { allowedHosts: ["private.example"] }),
    ).resolves.toEqual({ hostname: "private.example", resolvedIp: "127.0.0.1" });
  });

  test("allows every resolved address by IP allowlist", async (): Promise<void> => {
    lookup(["127.0.0.1", "::1"]);
    await expect(
      validateMediaUrl("https://private.example/a", { allowedHosts: ["127.0.0.1", "::1"] }),
    ).resolves.toStrictEqual({ hostname: "private.example", resolvedIp: "127.0.0.1" });
  });

  test.each(["127.0.0.1", "::1", "::ffff:127.0.0.1", "::7f00:1"])(
    "blocks the private address form %s",
    async (address: string): Promise<void> => {
      lookup([address]);
      await expect(validateMediaUrl("https://private.example/a", {})).rejects.toMatchObject({
        name: "MediaUrlBlockedError",
        message:
          "URL blocked: requests to private/internal networks are not allowed. To allow specific hosts, set the MEDIA_ALLOWED_HOSTS environment variable.",
      });
    },
  );
});

describe("media validation boundaries", (): void => {
  test("permits ordinary public unicast addresses", async (): Promise<void> => {
    lookup(["8.8.8.8", "2001:4860:4860::8888"]);
    await expect(validateMediaUrl("https://example.com/a", {})).resolves.toEqual({
      hostname: "example.com",
      resolvedIp: "8.8.8.8",
    });
  });

  test("normalizes a bracketed IPv6 host for lookup and allowlisting", async (): Promise<void> => {
    lookup(["::1"]);
    await expect(
      validateMediaUrl("http://[::1]/a", { allowedHosts: ["::1"] }),
    ).resolves.toStrictEqual({
      hostname: "[::1]",
      resolvedIp: "::1",
    });
    expect(dns.promises.lookup).toHaveBeenCalledWith("::1", { all: true });
  });

  test.each([
    ["../path/to/file.png", "pathtofile.png"],
    ["..\\path\\file.mp3", "pathfile.mp3"],
    ["\0../", "unnamed"],
    [".", "unnamed"],
    [" plain.jpg ", " plain.jpg "],
  ])("sanitizes %j to %j", (filename: string, expected: string): void => {
    expect(sanitizeMediaFilename(filename)).toBe(expected);
  });
});
