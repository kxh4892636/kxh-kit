// 真实 SSH 主机 smoke (issue 06): e2e 用 fake executor 覆盖全链路, 本脚本补传输层
// 在真实主机上的证据 —— createSshExecutor (ControlMaster/参数组装) + 远程 find 扫描
// 脚本 + RemoteGitDiffParser 数据面, 全部对真机执行。
// 用法: pnpm run build 后 `node scripts/ssh-smoke.mjs <target>`
// (target 为 ssh config Host 别名或 user@host[:port], 也可用环境变量
// DIFF_VIEWER_SSH_SMOKE_TARGET 提供; 远端需要 POSIX shell + find + git)
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parseSshTarget } = require("../dist/main/main/remote/ssh-target.js");
const { createSshExecutor } = require("../dist/main/main/remote/ssh-executor.js");
const { scanRemoteRepositories } = require("../dist/main/main/repo-scan/remote-repo-scanner.js");
const { RemoteGitDiffParser } = require("../dist/main/main/remote/remote-git-diff.js");

const target = process.argv[2] ?? process.env.DIFF_VIEWER_SSH_SMOKE_TARGET;
if (!target) {
  console.error(
    "用法: node scripts/ssh-smoke.mjs <target>\n" +
      "  target 为 ssh config Host 别名或 user@host[:port] (也可设 DIFF_VIEWER_SSH_SMOKE_TARGET)",
  );
  process.exit(2);
}
const remoteRoot = `/tmp/difit-smoke-${Date.now()}`;

// 夹具搭建/清理用 plain ssh (不经被测代码), 与被测路径隔离
const ssh = (command) =>
  execFileSync(
    "ssh",
    [
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=6",
      "-o",
      "ClearAllForwardings=yes",
      target,
      command,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`SMOKE FAIL: ${message}`);
  }
  console.log(`  ok: ${message}`);
};

const setupFixture = () =>
  ssh(
    [
      "set -e",
      `mkdir -p ${remoteRoot}/lib/nested-lib`,
      `cd ${remoteRoot}`,
      "git init -b main -q",
      "git config user.email smoke@example.com",
      "git config user.name smoke",
      "printf 'root one\\nroot two\\n' > a.txt",
      "git add . && git commit -qm 'root init'",
      "printf 'root one\\nroot two changed\\n' > a.txt",
      `cd ${remoteRoot}/lib/nested-lib`,
      "git init -b main -q",
      "git config user.email smoke@example.com",
      "git config user.name smoke",
      "printf 'nested one\\n' > nested.txt",
      "git add . && git commit -qm 'nested init'",
      "printf 'nested one\\nnested two\\n' > nested.txt",
    ].join("\n"),
  );

const main = async () => {
  console.log(`target: ${target}, remote fixture: ${remoteRoot}`);
  setupFixture();
  console.log("fixture ready (root repo + nested repo, both with uncommitted changes)");

  try {
    const executor = createSshExecutor(parseSshTarget(target));

    // 1) 连接 + rev-parse: ssh 传输层真实可用
    const rev = await executor.exec("git", ["rev-parse", "--short", "HEAD"], {
      cwd: remoteRoot,
    });
    if (rev.exitCode !== 0 || !/^[0-9a-f]{7}$/.test(rev.stdout.trim())) {
      throw new Error(
        `SMOKE FAIL: ssh exec git rev-parse (exit ${rev.exitCode}) stdout=${JSON.stringify(rev.stdout)} stderr=${JSON.stringify(rev.stderr)}`,
      );
    }
    console.log("  ok: ssh exec git rev-parse");

    // 2) 远程扫描: find 脚本在真机 POSIX shell 产出三节输出, 解析为仓库树
    const scan = await scanRemoteRepositories(executor, {
      remotePath: remoteRoot,
      keyBase: `ssh://${target}`,
    });
    assert(scan.repositories.length === 1, "scan finds root repository");
    const root = scan.repositories[0];
    assert(
      root.path === `ssh://${target}${remoteRoot}`,
      "root node path is the ssh:// session key",
    );
    assert(
      root.children.some((node) => node.name === "nested-lib"),
      "scan finds nested repo as child",
    );

    // 3) 数据面: 远程 parser 产出未提交改动 diff (根 + 嵌套仓)
    const rootParser = new RemoteGitDiffParser(executor, remoteRoot);
    const rootDiff = await rootParser.parseDiff({ baseCommitish: "HEAD", targetCommitish: "." });
    const rootFile = rootDiff.files.find((file) => file.path === "a.txt");
    assert(rootFile !== undefined, "root diff contains a.txt");
    assert(
      rootFile.chunks[0]?.lines.some((line) => line.content === "root two changed") === true,
      "root diff shows uncommitted line",
    );

    const nestedParser = new RemoteGitDiffParser(executor, `${remoteRoot}/lib/nested-lib`);
    const nestedDiff = await nestedParser.parseDiff({
      baseCommitish: "HEAD",
      targetCommitish: ".",
    });
    assert(
      nestedDiff.files.some((file) => file.path === "nested.txt"),
      "nested repo diff contains nested.txt",
    );

    console.log("SMOKE PASS");
  } finally {
    ssh(`rm -rf ${remoteRoot}`);
    console.log("fixture cleaned up");
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  try {
    ssh(`rm -rf ${remoteRoot}`);
  } catch {
    // 清理失败不掩盖主错误
  }
  process.exitCode = 1;
});
