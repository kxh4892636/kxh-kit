import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { formatIssues, runCheck } from "./check-runner.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "nano-flow-runner-"));
  roots.push(root);
  return root;
};

const script = async (root: string, name: string, body: string): Promise<string> => {
  const file = join(root, name);
  await writeFile(file, body, "utf8");
  return file;
};

describe("runCheck", () => {
  it("parses warnings and updated files", async () => {
    const root = await makeRoot();
    const file = await script(
      root,
      "good.mjs",
      `console.log(JSON.stringify({ ok: true, errors: [], warnings: [{ path: "a", rule: "r", message: "m" }], updated: ["x"] }))`,
    );
    const result = await runCheck({
      script: file,
      workspace: root,
      domainsPath: ".agents/domains",
      limits: {},
    });
    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.updated).toEqual(["x"]);
  });

  it("rejects a script without output", async () => {
    const root = await makeRoot();
    const file = await script(root, "empty.mjs", "");
    await expect(
      runCheck({ script: file, workspace: root, domainsPath: ".agents/domains", limits: {} }),
    ).rejects.toThrow(/没有输出/u);
  });

  it("rejects output that is not JSON", async () => {
    const root = await makeRoot();
    const file = await script(root, "bad.mjs", `console.log("not json")`);
    await expect(
      runCheck({ script: file, workspace: root, domainsPath: ".agents/domains", limits: {} }),
    ).rejects.toThrow(/无法解析/u);
  });

  it("formats issues with path and rule", () => {
    expect(formatIssues([{ path: "a", rule: "r", message: "m" }])).toBe("a: [r] m");
  });
});
