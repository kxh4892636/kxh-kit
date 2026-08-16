// electron-builder.yml 的契约守卫 (issue 08): 三平台 target 与产物布局一旦有变动,
// 这里先于打包失败。配置语义解析由 js-yaml 完成; 真实构建/安装/启动证据见
// scripts/pack-smoke.mjs (Windows 实机验收, 手动脚本未入门禁)。
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { load } from "js-yaml";
import { describe, it, expect } from "vitest";

// vitest 以包根为 cwd (vp run 按包执行), 配置文件在包根
interface ElectronBuilderConfig {
  appId: string;
  productName: string;
  files: string[];
  win: { target: string | Array<string | { target: string }> };
  mac: { target: string | Array<string | { target: string }> };
  linux: { target: string | Array<string | { target: string }> };
}

const targetNames = (target: ElectronBuilderConfig["win"]["target"]): string[] =>
  (Array.isArray(target) ? target : [target]).map((entry) =>
    typeof entry === "string" ? entry : entry.target,
  );

describe("electron-builder 配置 (issue 08)", () => {
  const readConfig = async (): Promise<ElectronBuilderConfig> => {
    const raw = await readFile(join(process.cwd(), "electron-builder.yml"), "utf8");
    return load(raw) as ElectronBuilderConfig;
  };

  it("应用元数据与产物布局: 只打 dist 产物与 package.json", async () => {
    const config = await readConfig();
    expect(config.appId).toBeTruthy();
    expect(config.productName).toBeTruthy();
    expect(config.files).toContain("dist/**");
  });

  it("三平台 target: Windows nsis / macOS dmg / Linux AppImage+deb", async () => {
    const config = await readConfig();
    expect(targetNames(config.win.target)).toContain("nsis");
    expect(targetNames(config.mac.target)).toContain("dmg");
    const linuxTargets = targetNames(config.linux.target);
    expect(linuxTargets).toContain("AppImage");
    expect(linuxTargets).toContain("deb");
  });

  it("pack 脚本存在且接 electron-builder", async () => {
    const pkg = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.pack).toContain("electron-builder");
  });
});
