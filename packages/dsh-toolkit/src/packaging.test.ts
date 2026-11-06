import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

interface Manifest {
  scripts: Record<string, string>;
  files: readonly string[];
}

const readManifest = async (): Promise<Manifest> =>
  JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as Manifest;

describe("打包契约", () => {
  it("构建挂在 prepack 上：pnpm pack 与 pnpm publish 都会跑", async () => {
    const { scripts } = await readManifest();
    // pnpm pack 的生命周期只有 prepack / prepare / postpack；prepublishOnly 仅随 publish 执行，
    // 挂在那里打包会静默带上陈旧 dist（缺 dist/nano-flow/）。
    expect(scripts["prepublishOnly"]).toBeUndefined();
    expect(scripts["prepack"]).toContain("build");
  });

  it("build 产出打包所需的全部 dist（宿主半、客户端半、nano-flow 资产）", async () => {
    const { scripts, files } = await readManifest();
    expect(files).toContain("dist");
    expect(scripts["build"]).toContain("copy-nano-flow-assets.mjs");
    expect(scripts["build"]).toContain("wrap-client.mjs");
  });
});
