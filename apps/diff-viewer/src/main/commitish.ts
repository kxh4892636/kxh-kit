// 从 difit 上游 src/cli/utils.ts 裁剪: 只保留 GitDiffParser 依赖的 commitish 校验与格式化,
// CLI 相关能力(stdin 检测、交互提示等)随 CLI 一起裁掉。

const isAsciiDigit = (char: string): boolean => char >= "0" && char <= "9";

const isValidBranchName = (name: string): boolean => {
  // Git 分支名规则
  if (name.startsWith("-")) return false;
  if (name.endsWith(".")) return false;
  // @ 是 HEAD 的合法 Git 别名, 予以放行
  if (name.includes("..")) return false;
  if (name.includes("@{")) return false;
  if (name.includes("//")) return false;
  if (name.startsWith("/") || name.endsWith("/")) return false;
  if (name.endsWith(".lock")) return false;

  // oxlint-disable-next-line no-control-regex -- 有意匹配控制字符: Git refname 禁止出现
  const forbiddenChars = /[~^:?*[\\\u0000-\u0020\u007F]/;
  if (forbiddenChars.test(name)) return false;

  const components = name.split("/");
  for (const component of components) {
    if (component === "") return false;
    if (component.startsWith(".")) return false;
    if (component.endsWith(".lock")) return false;
  }

  return true;
};

const stripRevisionSuffix = (commitish: string): string => {
  let suffixStart = commitish.length;

  while (suffixStart > 0) {
    const current = commitish[suffixStart - 1];

    if (current === "^") {
      suffixStart--;
      continue;
    }

    if (current === "~") {
      suffixStart--;
      continue;
    }

    if (!isAsciiDigit(current)) {
      break;
    }

    let digitStart = suffixStart - 1;
    while (digitStart > 0 && isAsciiDigit(commitish[digitStart - 1])) {
      digitStart--;
    }

    const operator = commitish[digitStart - 1];
    if (operator !== "^" && operator !== "~") {
      break;
    }

    suffixStart = digitStart - 1;
  }

  return commitish.slice(0, suffixStart);
};

const isValidCommitishBase = (baseCommitish: string): boolean => {
  const validBasePatterns = [
    /^[a-f0-9]{4,40}$/i, // SHA
    /^HEAD$/,
    /^@$/,
  ];

  if (validBasePatterns.some((pattern) => pattern.test(baseCommitish))) {
    return true;
  }

  // 分支、标签与远程引用遵循 git 引用命名规则
  return isValidBranchName(baseCommitish);
};

export const validateCommitish = (commitish: string): boolean => {
  if (!commitish || typeof commitish !== "string") {
    return false;
  }

  const trimmed = commitish.trim();
  if (trimmed.length === 0) {
    return false;
  }

  if (trimmed === "." || trimmed === "working" || trimmed === "staged") {
    return true; // 工作区与暂存区的特殊关键字
  }

  const baseCommitish = stripRevisionSuffix(trimmed);

  if (baseCommitish.length === 0) {
    return false;
  }

  return isValidCommitishBase(baseCommitish);
};

export const shortHash = (hash: string): string => hash.substring(0, 7);

export const createCommitRangeString = (baseHash: string, targetHash: string): string =>
  `${baseHash}...${targetHash}`;

export const validateDiffArguments = (
  targetCommitish: string,
  baseCommitish?: string,
): { valid: boolean; error?: string } => {
  if (!validateCommitish(targetCommitish)) {
    return { valid: false, error: "Invalid target commit-ish format" };
  }

  if (baseCommitish !== undefined && !validateCommitish(baseCommitish)) {
    return { valid: false, error: "Invalid base commit-ish format" };
  }

  // 特殊关键字只允许出现在 target, 不允许出现在 base (working vs staged 除外)
  const specialArgs = ["working", "staged", "."];
  if (baseCommitish && specialArgs.includes(baseCommitish)) {
    if (baseCommitish === "staged" && targetCommitish === "working") {
      // 合法: working vs staged
    } else {
      return {
        valid: false,
        error: `Special arguments (working, staged, .) are only allowed as target, not base. Got base: ${baseCommitish}`,
      };
    }
  }

  if (targetCommitish === baseCommitish) {
    return {
      valid: false,
      error: `Cannot compare ${targetCommitish} with itself`,
    };
  }

  // "working" 只展示未暂存改动, 只能与暂存区对比
  if (targetCommitish === "working" && baseCommitish && baseCommitish !== "staged") {
    return {
      valid: false,
      error:
        '"working" shows unstaged changes and cannot be compared with another commit. Use "." instead to compare all uncommitted changes with a specific commit.',
    };
  }

  return { valid: true };
};
