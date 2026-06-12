const fs = require("node:fs");
const path = require("node:path");

const DOCS_ROOT = path.resolve(__dirname, "..", "..");
const TARGET_DOCS_ROOT = "D:\\kxh\\10-wiki\\doc";
const MB = 1024 * 1024;

const normalizePath = (targetPath) => path.resolve(targetPath).toLowerCase();

const isPathInside = (childPath, parentPath) =>
  normalizePath(childPath).startsWith(`${normalizePath(parentPath)}${path.sep}`);

const assertCanExportDocs = (sourceRoot, targetRoot) => {
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`Source docs directory does not exist: ${sourceRoot}`);
  }
  if (!fs.statSync(sourceRoot).isDirectory()) {
    throw new Error(`Source docs path is not a directory: ${sourceRoot}`);
  }
  if (normalizePath(sourceRoot) === normalizePath(targetRoot)) {
    throw new Error("Source docs directory and target docs directory must be different.");
  }
  if (isPathInside(targetRoot, sourceRoot) || isPathInside(sourceRoot, targetRoot)) {
    throw new Error("Source docs directory and target docs directory cannot contain each other.");
  }
  if (normalizePath(targetRoot) !== normalizePath(TARGET_DOCS_ROOT)) {
    throw new Error(`Unexpected target docs directory: ${targetRoot}`);
  }
};

const exportDocsToTarget = (sourceRoot, targetRoot) => {
  assertCanExportDocs(sourceRoot, targetRoot);
  fs.mkdirSync(path.dirname(targetRoot), { recursive: true });

  if (fs.existsSync(targetRoot)) {
    // 只替换外部目标目录，源目录 apps/wiki/docs 不移动、不删除。
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }

  fs.cpSync(sourceRoot, targetRoot, {
    recursive: true,
    force: true,
    preserveTimestamps: true,
  });

  console.log(`docs exported to ${targetRoot}`);
};

const walkDirectory = (dirPath, options = {}) => {
  const { bottomUp = false } = options;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const dirs = entries?.filter((entry) => entry?.isDirectory())?.map((entry) => entry?.name);
  const files = entries?.filter((entry) => entry?.isFile())?.map((entry) => entry?.name);

  const current = { dirPath, dirs, files };

  if (!bottomUp) {
    return [current, ...dirs.flatMap((dir) => walkDirectory(path.join(dirPath, dir), options))];
  }

  return [...dirs.flatMap((dir) => walkDirectory(path.join(dirPath, dir), options)), current];
};

const createReadme = (dirPath) => {
  for (const { dirPath: currentDir, dirs, files } of walkDirectory(dirPath, {
    bottomUp: true,
  })) {
    // README 只为内容目录生成，跳过图片与脚本目录。
    if (currentDir?.includes("images") || currentDir?.includes("code")) {
      continue;
    }

    const title = path.basename(currentDir);
    const contentParts = [`# ${title}\n\n`];

    for (const file of files) {
      if (!file?.endsWith(".md")) {
        continue;
      }
      if (file === "_sidebar.md" || file === "README.md") {
        continue;
      }

      const fileName = file?.replace(/\.md$/, "");
      contentParts.push(`- [${fileName}](./${file})\n`);
    }

    for (const dir of dirs) {
      if (dir?.includes("images")) {
        continue;
      }
      if (
        dir?.includes("0-中转") ||
        dir?.includes("0-记录") ||
        dir?.includes("0-工作") ||
        dir?.includes("code")
      ) {
        continue;
      }

      contentParts.push(`- [${dir}](./${dir}/README.md)\n`);
    }

    const filePath = path.join(currentDir, "README.md");
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath);
    }
    fs.writeFileSync(filePath, contentParts.join(""), "utf8");
  }

  console.log("readme updated");
};

const printUnusedImages = (rootDir) => {
  const images = [];

  for (const { dirPath: currentDir, files } of walkDirectory(rootDir)) {
    let currentImages = [];

    if (!currentDir?.includes("wiki")) {
      continue;
    }

    for (const file of files) {
      if (!file?.endsWith("png")) {
        continue;
      }
      currentImages.push(path.join(currentDir, file));
    }

    if (path.basename(currentDir) !== "images") {
      continue;
    }

    const parentDir = path.dirname(currentDir);
    const mdFilesPath = fs
      .readdirSync(parentDir)
      ?.filter((file) => file?.endsWith(".md"))
      ?.map((file) => path.join(parentDir, file));

    for (const mdPath of mdFilesPath) {
      const content = fs.readFileSync(mdPath, "utf8");

      // 只要图片文件名出现在同级 Markdown 中，就视为仍在使用。
      currentImages = currentImages.filter((image) => {
        const imageName = path.basename(image);
        return !content?.includes(imageName);
      });
    }

    images.push(...currentImages);
  }

  for (const image of images) {
    console.log(image);
  }

  console.log("");
  return images;
};

const deleteUnusedImages = (images) => {
  // 删除前由 printUnusedImages 输出清单，便于从终端回看本次清理内容。
  for (const image of images) {
    fs.rmSync(image);
  }
};

const countNoteSize = (rootDir) => {
  let noteSize = 0;
  let diarySize = 0;
  let noteNum = 0;
  let diaryNum = 0;

  for (const { dirPath: currentDir, files } of walkDirectory(rootDir)) {
    if (!currentDir?.includes("wiki")) {
      continue;
    }

    for (const file of files) {
      if (!file?.endsWith(".md")) {
        continue;
      }
      if (file === "_sidebar.md" || file === "README.md") {
        continue;
      }

      const fileSize = fs.statSync(path.join(currentDir, file))?.size;
      if (currentDir?.includes("10-记录") && !file?.includes("-")) {
        diarySize += fileSize;
        diaryNum += 1;
      } else {
        noteSize += fileSize;
        noteNum += 1;
      }
    }
  }

  console.log(`共 ${noteNum} 个笔记`);
  console.log(`${noteSize / MB} MB`);
  console.log(`约合中文字符 ${noteSize / 2} 个`);
  console.log("");
  console.log(`共 ${diaryNum} 个日记`);
  console.log(`${diarySize / MB} MB`);
  console.log(`约合中文字符 ${diarySize / 2} 个`);
  console.log("");
};

createReadme(DOCS_ROOT);
const images = printUnusedImages(DOCS_ROOT);
deleteUnusedImages(images);
countNoteSize(DOCS_ROOT);
exportDocsToTarget(DOCS_ROOT, TARGET_DOCS_ROOT);
