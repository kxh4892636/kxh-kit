#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

const START_MARKER = "<!-- RECOMMEND SKILLS START-->";
const END_MARKER = "<!-- RECOMMEND SKILLS END -->";
const SKILL_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9:_-]*$/;

const usage = [
  "Usage:",
  "  node scripts/update-recommend-skills.mjs <path-to-AGENTS.md> <skill-name> [skill-name...]",
].join("\n");

const fail = (message) => {
  console.error(`agents-creator: ${message}`);
  console.error(usage);
  process.exit(1);
};

const findAll = ({ text, needle }) => {
  const indexes = [];
  let offset = 0;

  while (offset <= text.length) {
    const index = text.indexOf(needle, offset);
    if (index === -1) {
      break;
    }

    indexes.push(index);
    offset = index + needle.length;
  }

  return indexes;
};

const detectNewline = (text) => (text.includes("\r\n") ? "\r\n" : "\n");

const normalizeSkills = (rawSkills) => {
  const skills = rawSkills.map((skill) => skill.trim()).filter(Boolean);

  if (skills.length === 0) {
    fail("at least one skill name is required");
  }

  if (skills.length > 5) {
    fail("recommend skills block accepts at most 5 skills");
  }

  const seen = new Set();

  for (const skill of skills) {
    if (!SKILL_NAME_RE.test(skill)) {
      fail(`invalid skill name: ${skill}`);
    }

    if (seen.has(skill)) {
      fail(`duplicate skill name: ${skill}`);
    }

    seen.add(skill);
  }

  return skills;
};

const buildBlock = ({ skills, newline }) => [
  START_MARKER,
  "",
  ...skills,
  "",
  END_MARKER,
].join(newline);

const appendBlock = ({ text, block, newline }) => {
  if (text.length === 0) {
    return `${block}${newline}`;
  }

  const separator = text.endsWith(newline) ? newline : `${newline}${newline}`;
  return `${text}${separator}${block}${newline}`;
};

const replaceRecommendBlock = ({ text, skills }) => {
  const newline = detectNewline(text);
  const startIndexes = findAll({ text, needle: START_MARKER });
  const endIndexes = findAll({ text, needle: END_MARKER });
  const block = buildBlock({ skills, newline });

  if (startIndexes.length !== endIndexes.length) {
    fail("recommend skills markers are unbalanced");
  }

  if (startIndexes.length > 1) {
    fail("multiple recommend skills blocks found");
  }

  if (startIndexes.length === 0) {
    return appendBlock({ text, block, newline });
  }

  const start = startIndexes[0];
  const end = endIndexes[0];

  if (end < start) {
    fail("recommend skills end marker appears before start marker");
  }

  return `${text.slice(0, start)}${block}${text.slice(end + END_MARKER.length)}`;
};

const main = async () => {
  const [targetArg, ...skillArgs] = process.argv.slice(2);

  if (targetArg === "--help" || targetArg === "-h") {
    console.log(usage);
    return;
  }

  if (!targetArg) {
    fail("missing AGENTS.md path");
  }

  const targetPath = resolve(targetArg);

  if (basename(targetPath) !== "AGENTS.md") {
    fail("target file must be named AGENTS.md");
  }

  const skills = normalizeSkills(skillArgs);
  let text = "";

  try {
    text = await readFile(targetPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const updatedText = replaceRecommendBlock({ text, skills });

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, updatedText, "utf8");
  console.log(`updated ${targetPath}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
