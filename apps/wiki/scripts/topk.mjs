#!/usr/bin/env node
// osjobs Top K 面试题：抓取快照 + 生成按 tag 分组的 markdown。
//   node apps/wiki/scripts/topk.mjs fetch   抓 11 个全站 tag，写 topk-snapshot.json
//   node apps/wiki/scripts/topk.mjs render  读快照，写 docs/020-八股文梳理/{tag}.md
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// 收录的 tag（来源 api/category.json 的 sub_category），顺序即 sidebar_position，
// 也就是题数降序；改顺序请同步 spec 里的表。Java / C++ / Python 三个 tag 按用户要求不收录。
const TAGS = [
  { id: 8, name: "算法" },
  { id: 14, name: "前端" },
  { id: 9, name: "数据库" },
  { id: 10, name: "系统设计" },
  { id: 7, name: "网络协议" },
  { id: 6, name: "操作系统" },
  { id: 11, name: "非技术" },
  { id: 29, name: "Golang" },
];

const SOURCE = "https://osjobs.net/topk/";
const API = `${SOURCE}allcate_question/`;
const SNAPSHOT = fileURLToPath(new URL("./topk-snapshot.json", import.meta.url));
const OUT_DIR = new URL("../docs/020-八股文梳理/", import.meta.url);

const normalize = (text) => text.replace(/\s+/g, " ").trim();

async function fetchTag(tag) {
  const res = await fetch(API + tag.id + "/", {
    headers: { "user-agent": "Mozilla/5.0 (compatible; kxh-kit/wiki)" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`${tag.name}(${tag.id}) HTTP ${res.status}`);
  const data = await res.json();
  if (data.next) throw new Error(`${tag.name}(${tag.id}) 出现分页，需补翻页逻辑`);
  const questions = data.results
    .map((q) => ({ text: normalize(q.question_text), vote: q.vote }))
    .filter((q) => q.text);
  return { ...tag, count: questions.length, questions };
}

async function fetchAll() {
  const tags = [];
  const failed = [];
  for (const tag of TAGS) {
    try {
      const result = await fetchTag(tag);
      tags.push(result);
      console.log(`ok   ${tag.name}(${tag.id}) ${result.count} 题`);
    } catch (error) {
      failed.push(`${tag.name}(${tag.id}): ${error.message}`);
      console.error(`fail ${error.message}`);
    }
  }
  if (failed.length) {
    console.error(`抓取失败 ${failed.length} 个 tag，未写快照`);
    process.exitCode = 1;
    return;
  }
  const snapshot = {
    fetched_at: new Date().toISOString(),
    source: `${API}{id}/`,
    tags,
  };
  await writeFile(SNAPSHOT, JSON.stringify(snapshot, null, 2) + "\n");
  const total = tags.reduce((sum, tag) => sum + tag.count, 0);
  console.log(`写 ${SNAPSHOT}：${tags.length} 个 tag，共 ${total} 行`);
}

// 文件内去重：题面忽略空白差异后比对（同一题可能只是空格不同），保留较大次数与首次出现的位置。
function dedupe(questions) {
  const byKey = new Map();
  for (const [index, q] of questions.entries()) {
    const key = q.text.replace(/\s+/g, "");
    const seen = byKey.get(key);
    if (!seen) byKey.set(key, { ...q, index });
    else if (q.vote > seen.vote) byKey.set(key, { ...q, index: seen.index });
  }
  return [...byKey.values()].sort((a, b) => b.vote - a.vote || a.index - b.index);
}

async function renderTag(snapshot, tag, position) {
  const questions = dedupe(tag.questions);
  const date = snapshot.fetched_at.slice(0, 10);
  const body = questions.map((q) => `- ${q.vote} - ${q.text}`).join("\n");
  const file = [
    "---",
    `title: ${tag.name}`,
    `description: 面经高频${tag.name}题 ${questions.length} 道，按出现次数降序。`,
    `sidebar_position: ${position}`,
    "---",
    "",
    `# ${tag.name}`,
    "",
    `面经统计出现次数降序，共 ${questions.length} 道。`,
    `数据来源 [osjobs Top K](${SOURCE})，抓取于 ${date}。`,
    "",
    body,
    "",
  ].join("\n");
  const target = new URL(`${tag.name}.md`, OUT_DIR);
  await writeFile(target, file);
  return { name: tag.name, rows: tag.count, unique: questions.length };
}

async function renderAll() {
  const snapshot = JSON.parse(await readFile(SNAPSHOT, "utf8"));
  const results = [];
  for (const [index, tag] of snapshot.tags.entries()) {
    results.push(await renderTag(snapshot, tag, index + 1));
  }
  let dupes = 0;
  for (const r of results) {
    dupes += r.rows - r.unique;
    console.log(
      `write ${r.name}.md ${r.unique} 道${r.rows === r.unique ? "" : `（去重 ${r.rows - r.unique}）`}`,
    );
  }
  const total = results.reduce((sum, r) => sum + r.unique, 0);
  console.log(`共 ${results.length} 个文件，${total} 行，文件内去重 ${dupes} 条`);
}

const command = process.argv[2];
if (command === "fetch") await fetchAll();
else if (command === "render") await renderAll();
else {
  console.error("用法：node apps/wiki/scripts/topk.mjs <fetch|render>");
  process.exitCode = 2;
}
