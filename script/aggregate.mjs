#!/usr/bin/env node
// 将根目录 skills/ 下的所有 skill 聚合为单个 loop-x skill, 输出到 .agents/skills/loop-x:
// - 所有 subskill 复制到 .agents/skills/loop-x/subskills/
// - 非白名单 subskill: SKILL.md 重命名为 README.md, 移除 YAML frontmatter, 删除 agents/ 文件夹
// - 白名单 subskill: 原封不动复制
// - 生成 .agents/skills/loop-x/SKILL.md, 内含 subskill 引用表(路径 + 触发条件)
//
// 输出目录每次全量重建, 可重复运行.
// 用法: node script/aggregate.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const SKILLS_DIR = path.join(REPO_ROOT, "skills", "loop-x");
const OUTPUT_DIR = path.join(REPO_ROOT, ".agents", "skills", "loop-x");
const SUBSKILLS_DIR = path.join(OUTPUT_DIR, "subskills");

// 白名单: 数组内的 skill 原封不动复制到 subskills 中(保留 SKILL.md, YAML 头与 agents/)
const WHITELIST = [];

const AGGREGATED_DESCRIPTION =
	"Loop-X-Flow 提供的原子能力 skill, 在 Loop-X-Flow 或日常的工作过程中使用.";

/** 从 SKILL.md 内容中提取 frontmatter 的指定字段(仅支持单行) */
function extractField(content, field) {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) return "";
	const line = match[1].split(/\r?\n/).find((l) => l.startsWith(`${field}:`));
	if (!line) return "";
	return line
		.slice(field.length + 1)
		.trim()
		.replace(/^"(.*)"$/, "$1")
		.replace(/^'(.*)'$/, "$1");
}

/** 移除 YAML frontmatter, 返回正文 */
function stripFrontmatter(content) {
	return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n+/, "");
}

/** Markdown 表格单元格转义 */
function escapeCell(text) {
	return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function main() {
	const skillDirs = fs
		.readdirSync(SKILLS_DIR, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.filter((e) => fs.existsSync(path.join(SKILLS_DIR, e.name, "SKILL.md")))
		.map((e) => e.name)
		.sort();

	if (skillDirs.length === 0) {
		console.log("skills/ 下没有找到需要聚合的 skill, 退出.");
		return;
	}

	// 全量重建输出目录
	fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
	fs.mkdirSync(SUBSKILLS_DIR, { recursive: true });

	const rows = [];
	for (const name of skillDirs) {
		const src = path.join(SKILLS_DIR, name);
		const dest = path.join(SUBSKILLS_DIR, name);

		const skillMdContent = fs.readFileSync(path.join(src, "SKILL.md"), "utf8");
		const skillName = extractField(skillMdContent, "name") || name;
		const description = extractField(skillMdContent, "description");

		fs.cpSync(src, dest, { recursive: true });

		let entryFile = "SKILL.md";
		if (WHITELIST.includes(name)) {
			// 删除 agents/ 文件夹
			fs.rmSync(path.join(dest, "agents"), { recursive: true, force: true });
			// SKILL.md -> README.md, 移除 YAML 头
			const body = stripFrontmatter(
				fs.readFileSync(path.join(dest, "SKILL.md"), "utf8"),
			);
			fs.writeFileSync(path.join(dest, "README.md"), body);
			fs.rmSync(path.join(dest, "SKILL.md"));
			entryFile = "README.md";
		}

		const relPath = `subskills/${name}/${entryFile}`;
		rows.push(
			`| [${escapeCell(skillName)}](${relPath}) | ${escapeCell(description)} |`,
		);
		console.log(
			`已聚合: ${name}${WHITELIST.includes(name) ? " (白名单, 原封不动)" : ""}`,
		);
	}

	const skillMd = `---
name: loop-x
description: ${AGGREGATED_DESCRIPTION}
---

# Loop-X

Loop-X-Flow 提供的原子能力 skill 集合. 按需查阅下表中的 subskill.

| skill 名称 | 触发条件 |
| ---- | -------- |
${rows.join("\n")}
`;

	fs.writeFileSync(path.join(OUTPUT_DIR, "SKILL.md"), skillMd);
	console.log(
		`\n已生成 ${path.join(OUTPUT_DIR, "SKILL.md")}, 共 ${rows.length} 个 subskill.`,
	);
}

main();
