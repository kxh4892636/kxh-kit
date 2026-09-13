import { spawn } from "node:child_process";
import { cp, mkdir, rename, rm, stat } from "node:fs/promises";
import { basename, join, parse, resolve } from "node:path";

// ── 可修改变量 ───────────────────────────────────────────────────────────────

// 1. 同步：wiki 文档源目录 -> 目标目录
const wikiDocsSource = "C:/Users/kxh/kxh-awesome/projects/kxh-kit/apps/wiki/docs";
const wikiDocsTarget = "C:/Users/kxh/kxh-awesome/kxh/10-wiki/doc";

// 2. 加密打包：源目录 -> 同级同名的 .7z
const archiveSource = "C:/Users/kxh/kxh-awesome/kxh";
const archiveTarget = "C:/Users/kxh/kxh-awesome/kxh.7z";

// 3. 归档完成后同步（先完全删除同名文件，再剪切）到的目录
const cloudDirectory = "C:/Users/kxh/kxh-awesome/cloud/020-kxh";

const sevenZip = "C:/Program Files/7-Zip/7z.exe";

// 归档密码由运行时参数传入，不落盘、不进仓库。
// 用法：node scripts/backup-kxh.js <密码>
// 不想让它留在 shell 历史里时，改用环境变量 KXH_ARCHIVE_PASSWORD。
const password = process.argv[2] ?? process.env.KXH_ARCHIVE_PASSWORD;

// ── 工具 ─────────────────────────────────────────────────────────────────────

function run(command, args, stdio = ["ignore", "inherit", "inherit"]) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { stdio, windowsHide: true });
    child.on("error", fail);
    child.on("close", (code) => done(code ?? 1));
  });
}

// ── 三个步骤 ─────────────────────────────────────────────────────────────────

async function syncWikiDocs() {
  const target = resolve(wikiDocsTarget);

  if (target === parse(target).root) throw new Error("同步目标不能是磁盘根目录");
  // 源目录可用后再删除目标，避免源路径写错导致数据丢失。
  if (!(await stat(wikiDocsSource)).isDirectory())
    throw new Error(`源路径不是目录：${wikiDocsSource}`);

  await rm(target, { recursive: true, force: true });
  await cp(wikiDocsSource, target, { recursive: true });
  console.log(`同步完成：${wikiDocsSource} -> ${target}`);
}

async function createArchive() {
  const source = resolve(archiveSource);
  const target = resolve(archiveTarget);
  // 先写临时文件：7z 续写已存在的归档会保留源目录里已删除的旧条目。
  const temporary = `${target}.tmp-${process.pid}`;

  try {
    // -mx0 存储模式；-mhe=on 加密文件头，文件名与文件夹名一并隐藏。
    const code = await run(sevenZip, [
      "a",
      "-t7z",
      "-mx0",
      "-mhe=on",
      `-p${password}`,
      "-y",
      temporary,
      source,
    ]);
    if (code !== 0) throw new Error(`7-Zip 打包失败，退出码 ${code}`);

    // 只读文件头即可确认新归档能打开，避免删掉旧备份后才发现归档是坏的。
    // 丢弃 stdout：7z l 的清单不受 -bso0 影响，会刷出全部条目名。
    const verify = await run(
      sevenZip,
      ["l", `-p${password}`, temporary],
      ["ignore", "ignore", "inherit"],
    );
    if (verify !== 0) throw new Error("新归档无法用当前密码打开，原有备份未改动");

    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }

  console.log(`打包完成：${source} -> ${target}`);
  return target;
}

async function publishArchive(archivePath) {
  const destination = join(cloudDirectory, basename(archivePath));
  await mkdir(cloudDirectory, { recursive: true });
  await rm(destination, { force: true, recursive: true });
  await rename(archivePath, destination);
  console.log(`同步完成：${archivePath} -> ${destination}`);
}

// ── 入口 ─────────────────────────────────────────────────────────────────────

try {
  if (!password) throw new Error("用法：node scripts/backup-kxh.js <归档密码>");

  await syncWikiDocs();
  await publishArchive(await createArchive());
} catch (error) {
  console.error("失败：", error.message);
  process.exitCode = 1;
}
