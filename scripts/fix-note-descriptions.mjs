// 迁移后处理：把 note description 压回 144 码点以内（拆条时追加「（续 n）」可能溢出）。
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const domainsRoot = path.join(root, ".agents", "domains");
const LIFECYCLES = ["active", "reference", "archived"];
const LIMIT = 144;

const truncate = (value, limit) => {
  const points = [...value];
  if (points.length <= limit) return value;
  return points.slice(0, limit - 1).join("") + "…";
};

const plans = [];
for (const domain of readdirSync(domainsRoot)) {
  const plansRoot = path.join(domainsRoot, domain, "plans");
  if (!existsSync(plansRoot)) continue;
  for (const lifecycle of readdirSync(plansRoot)) {
    if (!LIFECYCLES.includes(lifecycle)) continue;
    for (const plan of readdirSync(path.join(plansRoot, lifecycle))) {
      const directory = path.join(plansRoot, lifecycle, plan);
      if (statSync(directory).isDirectory()) plans.push(directory);
    }
  }
}

let fixed = 0;
for (const directory of plans) {
  const notesPath = path.join(directory, "notes.json");
  if (!existsSync(notesPath)) continue;
  const document = JSON.parse(readFileSync(notesPath, "utf8"));
  let changed = false;
  for (const note of document.notes) {
    const next = truncate(note.description, LIMIT);
    if (next !== note.description) {
      note.description = next;
      changed = true;
      fixed += 1;
    }
  }
  if (changed) writeFileSync(notesPath, JSON.stringify(document, null, 2) + "\n");
}

console.log(JSON.stringify({ fixed, plans: plans.length }, null, 2));
