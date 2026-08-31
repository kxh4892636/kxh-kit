/**
 * cordis.patch.yml 结构测试: 覆盖行与插入行的存在性与顺序(ADR-0003)。
 *
 * patch 文件是装配层真实输入, 以字符串断言防误删/乱序;
 * `!!js dshHomePath(...)` 为 bundle patch 的合法表达式节点, 测试不执行它。
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const cwd = dirname(fileURLToPath(import.meta.url));
const patchPath = resolve(cwd, "../cordis.patch.yml");
const content = readFileSync(patchPath, "utf8");

const indexOf = (needle: string): number => content.indexOf(needle);

describe("cordis.patch.yml 结构", () => {
  it("覆盖 session-query-sqlite: openAt=first-search + 持久化 path", () => {
    expect(content).toContain("id: session-query-sqlite");
    expect(content).toContain("openAt: first-search");
    expect(content).toContain("path: !!js dshHomePath('storages/session-query.sqlite')");
  });

  it("插入上游工具行与插件行, 工具行在插件行之前", () => {
    const toolRow = indexOf('name: "@deepseek-ai/dsh-tool-session-query"');
    const pluginRow = indexOf('name: "@kxh4892636/dsh-session-manager"');
    expect(toolRow).toBeGreaterThan(-1);
    expect(pluginRow).toBeGreaterThan(-1);
    expect(toolRow).toBeLessThan(pluginRow);
  });

  it("index 覆盖行位于插入列表之前", () => {
    const overrideRow = indexOf("id: session-query-sqlite");
    const firstInsert = indexOf("- insert:");
    expect(overrideRow).toBeGreaterThan(-1);
    expect(firstInsert).toBeGreaterThan(-1);
    expect(overrideRow).toBeLessThan(firstInsert);
  });
});
