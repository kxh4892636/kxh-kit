// Windows 安装包实机验收 (issue 08): 构建 → 打 nsis → 静默安装到隔离目录 →
// playwright 驱动安装产物启动, 断言 diff 真实渲染 (file:// 布局 + asar 内资源可用)
// → 卸载并清理。手动脚本, 未入 pnpm ready 门禁 (分钟级耗时 + 写注册表);
// 重复执行: `node scripts/pack-smoke.mjs`。头两条输出即证据, 末行 SMOKE PASS/FAIL。
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { _electron as electron } from "@playwright/test";

// 脚本在 scripts/ 下, 包根为上级目录
const packageRoot = resolve(fileURLToPath(import.meta.url), "../..");

const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    ...options,
  });

// 最小 fixture: 与 src/main/fixture-repo.ts 同形态 (init → commit → 本地改动),
// 内联以保持脚本零 TS 依赖
const createFixture = async () => {
  const repoPath = await fs.mkdtemp(join(tmpdir(), "diff-viewer-pack-smoke-"));
  const git = (args) => run("git", ["-C", repoPath, ...args]);
  git(["init", "-b", "main"]);
  git(["config", "user.email", "smoke@example.com"]);
  git(["config", "user.name", "Smoke"]);
  await fs.writeFile(join(repoPath, "a.txt"), "line one\nline two\nline three\n", "utf8");
  git(["add", "."]);
  git(["commit", "-m", "init a.txt"]);
  await fs.writeFile(
    join(repoPath, "a.txt"),
    "line one\nline two changed locally\nline three\n",
    "utf8",
  );
  return repoPath;
};

const waitFor = async (predicate, description, timeoutMs = 120_000) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await predicate();
    if (result) return result;
    if (Date.now() > deadline) throw new Error(`等待超时: ${description}`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
  }
};

const main = async () => {
  const repoPath = await createFixture();
  const installDir = await fs.mkdtemp(join(tmpdir(), "diff-viewer-install-"));
  const userDataDir = await fs.mkdtemp(join(tmpdir(), "diff-viewer-pack-userdata-"));
  let app;

  try {
    console.log("[smoke] 构建 renderer/main 产物...");
    run("pnpm", ["run", "build"], { cwd: packageRoot, shell: true });

    console.log("[smoke] 打 Windows nsis 安装包...");
    run("pnpm", ["exec", "electron-builder", "--win", "nsis"], { cwd: packageRoot, shell: true });

    const releaseDir = join(packageRoot, "release");
    const installer = (await fs.readdir(releaseDir)).find(
      (name) => name.endsWith(".exe") && name.includes("Setup"),
    );
    if (!installer) throw new Error("release/ 下未找到 *Setup*.exe 安装包");
    const installerPath = join(releaseDir, installer);
    console.log(`[smoke] 安装包: ${installer}`);

    // NSIS 静默安装: /S 静默, /D= 指定目录 (必须最后一个参数, 不加引号)
    console.log(`[smoke] 静默安装到 ${installDir} ...`);
    execFileSync(installerPath, ["/S", `/D=${installDir}`], { stdio: "inherit" });
    const exePath = await waitFor(async () => {
      try {
        await fs.access(join(installDir, "Diff Viewer.exe"));
        return join(installDir, "Diff Viewer.exe");
      } catch {
        return false;
      }
    }, "安装产物 Diff Viewer.exe 出现");
    console.log("[smoke] 安装完成, 启动安装产物...");

    app = await electron.launch({
      executablePath: exePath,
      env: { ...process.env, DIFF_VIEWER_REPO: repoPath, DIFIT_USER_DATA_DIR: userDataDir },
    });
    const window = await app.firstWindow();
    await window.getByText("a.txt").first().waitFor({ timeout: 60_000 });
    await window.locator("tr", { hasText: "line two changed locally" }).first().waitFor({
      timeout: 30_000,
    });
    console.log("[smoke] 安装产物启动并渲染 diff 成功");
    console.log("SMOKE PASS");
  } finally {
    await app?.close();
    // NSIS 卸载器在 installDir 内, 静默卸载后再清理目录
    try {
      const uninstaller = (await fs.readdir(installDir)).find((name) =>
        name.startsWith("Uninstall"),
      );
      if (uninstaller) {
        execFileSync(join(installDir, uninstaller), ["/S"], { stdio: "inherit" });
      }
    } catch {
      console.warn("[smoke] 卸载器执行失败, 直接删除安装目录");
    }
    await fs.rm(installDir, { recursive: true, force: true });
    await fs.rm(repoPath, { recursive: true, force: true });
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error("SMOKE FAIL:", error);
  process.exit(1);
});
