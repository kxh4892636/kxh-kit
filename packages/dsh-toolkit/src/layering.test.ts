import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

const SRC = fileURLToPath(new URL(".", import.meta.url));

/** 收集 src 下全部源文件（跳过测试与非 TS 资产）。 */
const sourceFiles = (): string[] => {
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".ts")) continue;
      if (entry.name.endsWith(".test.ts")) continue;
      files.push(full);
    }
  };
  walk(SRC);
  return files;
};

/** 取出一个文件里所有相对 import 的目标（绝对路径）。 */
const importsOf = (file: string): string[] => {
  const text = readFileSync(file, "utf8");
  const targets: string[] = [];
  for (const match of text.matchAll(/from "([^"]+)"/g)) {
    const specifier = match[1] ?? "";
    if (!specifier.startsWith(".")) continue;
    targets.push(join(file, "..", specifier.replace(/\.m?js$/u, ".ts")));
  }
  return targets;
};

const violations = (predicate: (from: string, to: string) => string | undefined): string[] => {
  const found: string[] = [];
  for (const file of sourceFiles()) {
    for (const target of importsOf(file)) {
      const reason = predicate(relative(SRC, file), relative(SRC, target));
      if (reason !== undefined) found.push(reason);
    }
  }
  return found;
};

describe("分层依赖", () => {
  it("shared 不依赖 host / client / nano-flow", () => {
    const bad = violations((from, to) => {
      if (!from.startsWith("shared/")) return undefined;
      if (/^(host|client|nano-flow)\//u.test(to)) return `${from} -> ${to}`;
      return undefined;
    });
    expect(bad).toEqual([]);
  });

  it("nano-flow 不依赖 client", () => {
    const bad = violations((from, to) => {
      if (!from.startsWith("nano-flow/")) return undefined;
      if (to.startsWith("client/")) return `${from} -> ${to}`;
      return undefined;
    });
    expect(bad).toEqual([]);
  });

  it("client 不依赖 host（两端分别打包）", () => {
    const bad = violations((from, to) => {
      if (!from.startsWith("client/")) return undefined;
      if (to.startsWith("host/") || to.startsWith("nano-flow/")) return `${from} -> ${to}`;
      return undefined;
    });
    expect(bad).toEqual([]);
  });
});
