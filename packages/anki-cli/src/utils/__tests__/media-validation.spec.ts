import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MediaFileTypeError,
  MediaImportDirError,
  MediaUrlBlockedError,
  MediaUrlInvalidError,
  MediaUrlSchemeError,
  getMediaFilePathConfigFromEnv,
  getMediaUrlConfigFromEnv,
  sanitizeMediaFilename,
  validateMediaFilePath,
  validateMediaUrl,
} from "../media-validation";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

describe("sanitizeMediaFilename", () => {
  it("去除路径穿越与分隔符", () => {
    expect(sanitizeMediaFilename("../etc/passwd")).toBe("etcpasswd");
    expect(sanitizeMediaFilename("..\\..\\secret.png")).toBe("secret.png");
    // 与上游语义一致: 先去除全部分隔符再取 basename。
    expect(sanitizeMediaFilename("a/b/c.jpg")).toBe("abc.jpg");
  });

  it("null 字节去除", () => {
    expect(sanitizeMediaFilename("a\0b.png")).toBe("ab.png");
  });

  it("空结果回落 unnamed", () => {
    expect(sanitizeMediaFilename("..")).toBe("unnamed");
    expect(sanitizeMediaFilename("")).toBe("unnamed");
  });
});

describe("validateMediaFilePath", () => {
  const makeTempFile = (name: string): string => {
    const dir = mkdtempSync(path.join(tmpdir(), "anki-cli-media-"));
    tempDirs.push(dir);
    const filePath = path.join(dir, name);
    writeFileSync(filePath, "x");
    return filePath;
  };

  it("媒体扩展名放行", () => {
    const filePath = makeTempFile("pic.png");
    const result = validateMediaFilePath(filePath);
    expect(result.mimeType).toBe("image/png");
    expect(result.resolvedPath).toBe(path.resolve(filePath));
  });

  it("非媒体类型拒绝", () => {
    const filePath = makeTempFile("secrets.txt");
    expect(() => validateMediaFilePath(filePath)).toThrow(MediaFileTypeError);
  });

  it("allowedTypes 扩展放行", () => {
    const filePath = makeTempFile("doc.pdf");
    const result = validateMediaFilePath(filePath, {
      allowedTypes: ["application/pdf"],
    });
    expect(result.mimeType).toBe("application/pdf");
  });

  it("importDir 限制目录外拒绝", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "anki-cli-import-"));
    tempDirs.push(dir);
    const inside = path.join(dir, "in.png");
    const outside = path.join(tmpdir(), "out.png");
    writeFileSync(inside, "x");
    writeFileSync(outside, "x");

    expect(validateMediaFilePath(inside, { importDir: dir }).mimeType).toBe("image/png");
    expect(() => validateMediaFilePath(outside, { importDir: dir })).toThrow(MediaImportDirError);
  });

  it("null 字节路径拒绝", () => {
    expect(() => validateMediaFilePath("a\0b.png")).toThrow(MediaFileTypeError);
  });
});

describe("validateMediaUrl", () => {
  it("环回地址(127.0.0.1)被 SSRF 拦截", async () => {
    await expect(validateMediaUrl("http://localhost:1234/x")).rejects.toThrow(MediaUrlBlockedError);
  });

  it("私网 IP 被拦截", async () => {
    await expect(validateMediaUrl("http://192.168.1.1/x")).rejects.toThrow(MediaUrlBlockedError);
  });

  it("非 http(s) 协议拒绝", async () => {
    await expect(validateMediaUrl("ftp://example.com/x")).rejects.toThrow(MediaUrlSchemeError);
  });

  it("非法 URL 拒绝", async () => {
    await expect(validateMediaUrl("not a url")).rejects.toThrow(MediaUrlInvalidError);
  });

  it("allowedHosts 放行指定主机", async () => {
    const result = await validateMediaUrl("http://localhost:1234/x", {
      allowedHosts: ["localhost"],
    });
    expect(result.hostname).toBe("localhost");
  });
});

describe("env 配置读取", () => {
  it("MEDIA_ALLOWED_TYPES / MEDIA_IMPORT_DIR", () => {
    vi.stubEnv("MEDIA_ALLOWED_TYPES", "application/pdf, image/svg+xml");
    vi.stubEnv("MEDIA_IMPORT_DIR", "C:\\media");
    expect(getMediaFilePathConfigFromEnv()).toEqual({
      allowedTypes: ["application/pdf", "image/svg+xml"],
      importDir: "C:\\media",
    });
  });

  it("MEDIA_ALLOWED_HOSTS", () => {
    vi.stubEnv("MEDIA_ALLOWED_HOSTS", "192.168.1.50,my-nas");
    expect(getMediaUrlConfigFromEnv()).toEqual({
      allowedHosts: ["192.168.1.50", "my-nas"],
    });
  });
});
