import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { resolve, dirname } from "node:path";

const root = resolve(".cache/nano-mem-eval/data/lme-v2");
const revision = "f152293e235517d504809563c833d7190b8c713b";
const sizes = new Map();
const download = async (name) => {
  if (!/^[a-zA-Z0-9_./-]+$/u.test(name) || name.split("/").includes(".."))
    throw new Error("Invalid dataset path");
  const path = resolve(root, name);
  try {
    if ((await stat(path)).size === sizes.get(name)) return;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(dirname(path), { recursive: true });
  const response = await fetch(
    `https://huggingface.co/datasets/xiaowu0162/longmemeval-v2/resolve/${revision}/${name}`,
  );
  if (!response.ok) throw new Error(`Download ${name}: HTTP ${response.status}`);
  await pipeline(response.body, createWriteStream(path));
  console.log(JSON.stringify({ downloaded: name }));
};

try {
  await mkdir(root, { recursive: true });
  const listing = await fetch(
    `https://huggingface.co/api/datasets/xiaowu0162/longmemeval-v2/tree/${revision}?recursive=true&limit=1000`,
  );
  if (!listing.ok) throw new Error(`Dataset listing: HTTP ${listing.status}`);
  for (const item of await listing.json()) sizes.set(item.path, item.size);
  await writeFile(resolve(root, "revision.json"), JSON.stringify({ sha: revision }));
  for (const name of [
    "SCHEMA.md",
    "DATA_CARD.md",
    "checksums.sha256",
    "questions.jsonl",
    "haystacks/lme_v2_small.json",
  ])
    await download(name);
  const questions = (await readFile(resolve(root, "questions.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map(JSON.parse);
  for (const question of questions.filter((item) => item.image)) await download(question.image);
  await download("trajectories.jsonl");
  await writeFile(
    resolve(root, "download-complete.json"),
    JSON.stringify({ revision, completedAt: new Date().toISOString() }),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
