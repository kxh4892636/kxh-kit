const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const SOURCE_FOLDERS = ["d:\\kxh"];
const ARCHIVE_DIR = "d:\\sync";
const CLOUD_DIR = "d:\\cloud\\020-kxh";
const ARCHIVE_PASSWORD = "?$/z;8JjsQ@:7:vJA7Om";

const getDateSuffix = () => {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `_${year}${month}${day}`;
};

const createArchives = (sourceFolders, destinationPath) => {
  const dateSuffix = getDateSuffix();

  for (const folderPath of sourceFolders) {
    const archiveName = `${path.basename(folderPath)}${dateSuffix}.7z`;
    const archivePath = path.join(destinationPath, archiveName);
    const result = spawnSync(
      "7z",
      ["a", archivePath, folderPath, "-xr@ignore.txt", `-p${ARCHIVE_PASSWORD}`, "-mhe"],
      {
        cwd: __dirname,
        stdio: "inherit",
        shell: false,
      },
    );

    // 7z 失败时立即停止,避免继续移动或清理旧备份.
    if (result?.error) {
      throw result.error;
    }
    if (result?.status !== 0) {
      throw new Error(`7z exited with status ${result?.status}`);
    }
  }
};

const moveFile = (sourcePath, destinationPath) => {
  try {
    fs.renameSync(sourcePath, destinationPath);
  } catch (error) {
    if (error?.code !== "EXDEV") {
      throw error;
    }

    fs.copyFileSync(sourcePath, destinationPath);
    fs.rmSync(sourcePath);
  }
};

const moveArchives = (sourcePath, destinationPath) => {
  for (const file of fs.readdirSync(sourcePath)) {
    if (!file?.includes("kxh")) {
      continue;
    }

    const localPath = path.join(sourcePath, file);
    const cloudPath = path.join(destinationPath, file);
    if (fs.existsSync(cloudPath)) {
      continue;
    }

    // 只移动云端缺失的压缩包,避免覆盖已有备份.
    moveFile(localPath, cloudPath);
  }
};

const deleteOlderArchives = (archivePath) => {
  const files = fs.readdirSync(archivePath)?.filter((file) => file?.includes("kxh"));

  if (files?.length <= 3) {
    return;
  }

  const filesToDelete = files?.sort()?.slice(0, files?.length - 3);

  // 保留最新 3 个按文件名排序的备份,其余旧压缩包清理掉.
  for (const file of filesToDelete) {
    fs.rmSync(path.join(archivePath, file));
  }
};

createArchives(SOURCE_FOLDERS, ARCHIVE_DIR);
moveArchives(ARCHIVE_DIR, CLOUD_DIR);
deleteOlderArchives(CLOUD_DIR);
