import fs from "node:fs/promises";
import path from "node:path";
import {
  deriveSpecStatus,
  ISSUE_STATUSES,
  parseFrontmatter,
  parseIssueDependencies,
} from "./plan-document.mjs";
import { fail } from "./flow-store.mjs";

const fields = (content, file) => {
  const parsed = typeof content === "string" && parseFrontmatter(content);
  if (!parsed) fail(`${file} 缺少 YAML frontmatter`);
  return parsed;
};

const replaceStatus = (content, status, file) => {
  const parsed = fields(content, file);
  if (!parsed.fields.has("status")) fail(`${file} 缺少 status`);
  return content.replace(
    parsed.match[0],
    parsed.match[0].replace(/^status:.*$/m, `status: ${status}`),
  );
};

export const loadDocuments = async (store, workspace, plan) => {
  const specPath = `${plan}/spec.md`;
  const spec = await store.read(specPath);
  fields(spec, specPath);
  const entries = await fs.readdir(path.resolve(workspace, plan), { withFileTypes: true });
  const issues = [];
  for (const entry of entries
    .filter((item) => item.isFile() && /^\d{2}-.+\.md$/.test(item.name))
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const file = `${plan}/${entry.name}`;
    const content = await store.read(file);
    const frontmatter = fields(content, file).fields;
    const status = frontmatter.get("status");
    if (!ISSUE_STATUSES.includes(status)) fail(`${file} 的 status 无效`);
    const parsed = parseIssueDependencies(frontmatter.get("blocked_by"));
    if (parsed.kind !== "valid") fail(`${file} 的 blocked_by 必须是两位 Issue ID 的 JSON 数组`);
    const id = entry.name.slice(0, 2);
    if (issues.some((issue) => issue.id === id)) fail(`重复 Issue ${id}`);
    issues.push({ id, path: file, content, status, dependencies: parsed.dependencies });
  }
  if (!issues.length) fail(`${plan} 没有 Issue 文件`);
  for (const issue of issues) {
    for (const dependency of issue.dependencies) {
      if (dependency === issue.id || !issues.some((item) => item.id === dependency))
        fail(`Issue ${issue.id} 的依赖 ${dependency} 无效`);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (issue) => {
    if (visiting.has(issue.id)) fail(`Issue ${issue.id} 存在循环依赖`);
    if (visited.has(issue.id)) return;
    visiting.add(issue.id);
    for (const id of issue.dependencies) visit(issues.find((item) => item.id === id));
    visiting.delete(issue.id);
    visited.add(issue.id);
  };
  issues.forEach(visit);
  return { issues, spec, specPath };
};

export const issueReady = (documents, issue) =>
  issue.dependencies.every(
    (id) => documents.issues.find((item) => item.id === id).status === "completed",
  );

export const setIssueStatus = (issue, status) => {
  issue.content = replaceStatus(issue.content, status, issue.path);
  issue.status = status;
};

export const blockIssue = (issue, reason, condition) => {
  const section = `## 阻塞记录\n\n- 障碍: ${reason}\n- 解除条件: ${condition}\n\n`;
  const pattern = /^## 阻塞记录\r?\n[\s\S]*?(?=^## |(?![\s\S]))/m;
  issue.content = pattern.test(issue.content)
    ? issue.content.replace(pattern, section)
    : `${issue.content.trimEnd()}\n\n${section}`;
  setIssueStatus(issue, "blocked");
};

export const hasDeliveryEvidence = (content) => {
  const section = content.match(/^## (?:交付记录|交付物与证据)\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  if (!section) return false;
  const body = section[1]
    .split(/\r?\n/)
    .filter((line) => !/^\s*\{.*\}\s*$/.test(line))
    .join("\n");
  return body.includes("交付物") && body.includes("证据");
};

export const stageDocuments = async (store, documents) => {
  let spec = replaceStatus(documents.spec, deriveSpecStatus(documents.issues), documents.specPath);
  for (const issue of documents.issues) {
    const row = new RegExp(
      `^(\\|\\s*${issue.id}\\s*\\|\\s*\\[[^\\]]+\\]\\([^)]+\\)\\s*\\|\\s*)(pending|in_progress|blocked|completed)(\\s*\\|.*)$`,
      "m",
    );
    if (!row.test(spec)) fail(`${documents.specPath} 的 Issue 表缺少 ${issue.id}`);
    spec = spec.replace(row, `$1${issue.status}$3`);
    await store.stage(issue.path, issue.content);
  }
  await store.stage(documents.specPath, spec);
};
