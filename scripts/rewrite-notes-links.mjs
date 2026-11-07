// 迁移后处理：把指向「已并入 notes.json 的原 note 文件」（NN-*.md）的链接改成 note 引用。
// 规则见 Plan note 13：链接目标已被转换删除，链接文本保留为 `note NN「标题」`，不丢弃内容。
// 幂等：没有 NN-*.md 链接时不动文件。
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const domainsRoot = path.join(root, ".agents", "domains");
const LIFECYCLES = ["active", "reference", "archived"];
const LINK = /\[([^\]]+)\]\(([^)\s]+?\.md)(#[^)]*)?\)/g;

const stripSuffix = (title) => title.replace(/（\d+\/\d+）$/, "");

const planDirectories = () => {
  const result = [];
  for (const domain of readdirSync(domainsRoot)) {
    const plansRoot = path.join(domainsRoot, domain, "plans");
    if (!existsSync(plansRoot)) continue;
    for (const lifecycle of readdirSync(plansRoot)) {
      if (!LIFECYCLES.includes(lifecycle)) continue;
      const lifecycleRoot = path.join(plansRoot, lifecycle);
      for (const plan of readdirSync(lifecycleRoot)) {
        const directory = path.join(lifecycleRoot, plan);
        if (statSync(directory).isDirectory()) result.push(directory);
      }
    }
  }
  return result;
};

const results = [];
for (const directory of planDirectories()) {
  const notesPath = path.join(directory, "notes.json");
  if (!existsSync(notesPath)) continue;
  const document = JSON.parse(readFileSync(notesPath, "utf8"));
  if (document.notes.length === 0) continue;

  const byTitle = new Map();
  for (const note of document.notes) byTitle.set(stripSuffix(note.title), note);

  const replacement = (target) => {
    const base = decodeURIComponent(target.split("/").pop() ?? "");
    const match = base.match(/^\d{2}-(.+)\.md$/);
    if (match === null) return undefined;
    const note = byTitle.get(match[1]);
    if (note === undefined) return undefined;
    return `note ${note.id}「${stripSuffix(note.title)}」`;
  };

  let changed = 0;
  const rewrite = (text) =>
    text.replace(LINK, (whole, _label, target) => {
      const next = replacement(target);
      if (next === undefined) return whole;
      changed += 1;
      return next;
    });

  for (const note of document.notes) note.content = rewrite(note.content);
  let specChanged = false;
  for (const file of ["spec.md", "story.md"]) {
    const filePath = path.join(directory, file);
    if (!existsSync(filePath)) continue;
    const before = readFileSync(filePath, "utf8");
    const after = rewrite(before);
    if (after !== before) {
      writeFileSync(filePath, after);
      specChanged = true;
    }
  }
  if (changed > 0 || specChanged) {
    writeFileSync(notesPath, JSON.stringify(document, null, 2) + "\n");
    results.push({ plan: path.relative(domainsRoot, directory), changed });
  }
}

console.log(
  JSON.stringify(
    {
      rewritten: results.length,
      links: results.reduce((sum, item) => sum + item.changed, 0),
      results,
    },
    null,
    2,
  ),
);
