// 一次性迁移：把 .agents/domains 下没有 notes.json 的旧 Markdown Plan 转成 notes.json DAG。
// 规则见 Plan 的 note 13：
// - NN-标题.md → note（正文原样，去掉 frontmatter）；status / blocked_by 取 frontmatter。
// - 正文超过 noteMaxBytes 时按标题边界拆条，标题加（i/n），id 重新按顺序编号。
// - story.md 缺失时从 spec 的「问题 / 背景 / 目标」提炼，并标注「由 spec 迁移生成」。
// - spec 超过 specMaxBytes 时拆成 spec.md（含分册链接）+ spec-NN-分册.md。
// - evidence 抽「验收 / 验证 / 检查 / 测试」段落；缺失写「原 Plan 无独立验证记录（历史迁移）」。
// 幂等：已有 notes.json 的 Plan 直接跳过。
//
// 用法：
//   node scripts/migrate-legacy-plans.mjs [--dry-run]
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const root = process.cwd();
const domainsRoot = path.join(root, ".agents", "domains");
const NOTE_LIMIT = 13312;
const SPEC_LIMIT = 34816;
const STORY_LIMIT = 34816;
const DESC_LIMIT = 144;
const FIXED_NOW = "2026-11-07T00:00:00.000Z";
const LIFECYCLES = ["active", "reference", "archived"];
const FALLBACK_EVIDENCE = "原 Plan 无独立验证记录（历史迁移）";

const dryRun = process.argv.includes("--dry-run");

const bytes = (value) => Buffer.byteLength(value, "utf8");

/** 按码点截断。 */
const truncate = (value, limit) => [...value].slice(0, limit).join("");

/** 去掉首个 H1 与尾随空白，统一换行。 */
const normalizeBody = (value) =>
  value.replace(/\r\n/g, "\n").replace(/^\n+/, "").replace(/\s+$/, "") + "\n";

/** 拆开 YAML frontmatter（只认 `key: value` 与 JSON 数组）。 */
const splitFrontmatter = (text) => {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") return { meta: {}, body: text };
  let end = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === "---") {
      end = index;
      break;
    }
  }
  if (end === -1) return { meta: {}, body: text };
  const meta = {};
  for (const line of lines.slice(1, end)) {
    const match = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (match === null) continue;
    const [, key, raw] = match;
    const value = raw.trim();
    if (value.startsWith("[")) {
      try {
        meta[key] = JSON.parse(value);
      } catch {
        meta[key] = [];
      }
    } else if (value === "null") {
      meta[key] = null;
    } else if (value !== "") {
      meta[key] = value;
    }
  }
  return { meta, body: lines.slice(end + 1).join("\n") };
};

/** 一句话摘要：H1 之后第一个普通段落。 */
const describe = (title, body) => {
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const candidate = lines.find(
    (line) =>
      !line.startsWith("#") &&
      !line.startsWith(">") &&
      !line.startsWith("|") &&
      !line.startsWith("```") &&
      !line.startsWith("---"),
  );
  const text = (candidate ?? title).replace(/^[-*]\s+/, "").replaceAll("**", "");
  return truncate(text, DESC_LIMIT);
};

/** 抽验收段落里的条目作为 evidence。 */
const extractEvidence = (body) => {
  const items = [];
  let inSection = false;
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading !== null) {
      inSection = /验收|验证|检查|测试/.test(heading[1]);
      continue;
    }
    if (!inSection || line === "") continue;
    const clean = line.replace(/^[-*]\s*(?:\[[ xX]\]\s*)?/, "").trim();
    if (clean === "") continue;
    items.push(truncate(clean, 160));
    if (items.length >= 8) break;
  }
  return items.length > 0 ? items : [FALLBACK_EVIDENCE];
};

/** 按行累积到字节上限；超长单行按字面硬切。 */
const chunkLines = (body, limit) => {
  if (bytes(body) <= limit) return [body];
  const chunks = [];
  let current = [];
  const flush = () => {
    if (current.length === 0) return;
    chunks.push(current.join("\n").trim() + "\n");
    current = [];
  };
  for (const line of body.split("\n")) {
    if (bytes(line) + 1 > limit) {
      flush();
      for (let offset = 0; offset < line.length; offset += 400) {
        chunks.push(line.slice(offset, offset + 400) + "\n");
      }
      continue;
    }
    const next = [...current, line];
    if (bytes(next.join("\n")) + 1 > limit && current.length > 0) flush();
    current.push(line);
  }
  flush();
  return chunks;
};

/** 从 spec 里找「问题 / 背景 / 目标」小节，找不到就用第一段。 */
const deriveStory = (planName, specText) => {
  const sections = specText.split(/^## /m).slice(1);
  const wanted = sections.find((section) => /^(问题|背景|目标)/.test(section.trim()));
  const source = wanted ?? sections[0] ?? specText.split("\n").slice(1).join("\n");
  const text = normalizeBody(source.replace(/^[^\n]*\n/, "")).trim();
  const budget = STORY_LIMIT - 600;
  let clipped = text;
  if (bytes(clipped) > budget) {
    while (bytes(clipped) > budget && clipped.length > 0) {
      clipped = clipped.slice(0, Math.floor(clipped.length * 0.9));
    }
    clipped += "\n\n（超出 story 上限，剩余内容见 spec。）";
  }
  return `# ${planName}\n\n> 由 spec 迁移生成（2026-11-07）；原 Plan 无独立 story。\n\n## US-001 ${planName}\n\n${clipped}\n`;
};

const listFiles = (directory) =>
  readdirSync(directory)
    .filter((name) => statSync(path.join(directory, name)).isFile())
    .sort((left, right) => left.localeCompare(right, "zh-CN"));

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
        if (!statSync(directory).isDirectory()) continue;
        result.push({ domain, lifecycle, plan, directory });
      }
    }
  }
  return result;
};

const convertPlan = ({ domain, lifecycle, plan, directory }) => {
  const notesPath = path.join(directory, "notes.json");
  if (existsSync(notesPath)) return { skipped: true };

  const planName = plan.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  const files = listFiles(directory);
  const noteFiles = files.filter((name) => /^\d{2}-.+\.md$/.test(name));

  let notes = [];
  const sourceFiles = [];
  /** 原编号 → 新编号（拆分后仍指向该文件的第一条）。 */
  const idMap = new Map();
  for (const file of noteFiles) {
    const text = readFileSync(path.join(directory, file), "utf8");
    const { meta, body } = splitFrontmatter(text);
    const title = file.replace(/^\d{2}-/, "").replace(/\.md$/, "");
    const originalId = file.slice(0, 2);
    const content = normalizeBody(body);
    const chunks = chunkLines(content, NOTE_LIMIT);
    const base = {
      description: describe(title, content),
      status: meta.status === "in_progress" ? "in_progress" : "completed",
      evidence: extractEvidence(content),
      updated_at: FIXED_NOW,
    };
    const firstId = String(notes.length + 1).padStart(2, "0");
    if (chunks.length === 1) {
      notes.push({ ...base, title, content, blockedBySource: meta.blocked_by });
    } else {
      for (const [index, chunk] of chunks.entries()) {
        notes.push({
          ...base,
          title: `${title}（${index + 1}/${chunks.length}）`,
          content: chunk,
          description: index === 0 ? base.description : `${base.description}（续 ${index + 1}）`,
          blockedBySource: index === 0 ? meta.blocked_by : [],
        });
      }
    }
    idMap.set(originalId, firstId);
    sourceFiles.push(file);
  }

  // 没有编号 note 的 Plan（如设计稿）：notes 为空数组。
  const described = notes.map((note, index) => ({
    id: String(index + 1).padStart(2, "0"),
    title: note.title,
    description: note.description,
    status: note.status,
    blocked_by: (Array.isArray(note.blockedBySource) ? note.blockedBySource : []).map(
      (id) => idMap.get(String(id)) ?? String(id),
    ),
    evidence: note.evidence,
    updated_at: note.updated_at,
    content: note.content,
  }));

  const document = { version: 1, index: [], notes: described };
  const serialized = JSON.stringify(document, null, 2) + "\n";

  // spec 超限时拆册。
  const specPath = path.join(directory, "spec.md");
  let specSplit = 0;
  if (existsSync(specPath)) {
    const specText = readFileSync(specPath, "utf8");
    if (bytes(specText) > SPEC_LIMIT) {
      const chunks = chunkLines(specText, SPEC_LIMIT - 700);
      const subNames = chunks
        .slice(1)
        .map((_, index) => `spec-${String(index + 1).padStart(2, "0")}-分册.md`);
      const indexLines = subNames.map((name) => `- [${name}](${name})`);
      const head = `${chunks[0].trim()}\n\n## 分册\n\n${indexLines.join("\n")}\n`;
      specSplit = chunks.length - 1;
      if (!dryRun) {
        writeFileSync(specPath, head);
        for (const [index, chunk] of chunks.slice(1).entries()) {
          writeFileSync(path.join(directory, subNames[index]), chunk);
        }
      }
    }
  }

  // story 缺失时从 spec 提炼。
  const storyPath = path.join(directory, "story.md");
  let storyGenerated = false;
  if (!existsSync(storyPath)) {
    const source = existsSync(specPath) ? readFileSync(specPath, "utf8") : "";
    const story = deriveStory(planName, source);
    if (!dryRun) writeFileSync(storyPath, story);
    storyGenerated = true;
  }

  if (!dryRun) {
    writeFileSync(notesPath, serialized);
    for (const file of sourceFiles) unlinkSync(path.join(directory, file));
  }

  return {
    skipped: false,
    plan: `${domain}/${lifecycle}/${plan}`,
    notes: described.length,
    splits: described.length - sourceFiles.length,
    specSplit,
    storyGenerated,
  };
};

const results = planDirectories().map(convertPlan);
const converted = results.filter((result) => !result.skipped);
console.log(JSON.stringify({ dryRun, converted }, null, 2));
