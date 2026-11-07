// 迁移核对：统计每个 Plan 的 note 数与正文总字节，供 note 13 的 evidence 使用。
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const domainsRoot = path.join(root, ".agents", "domains");
const LIFECYCLES = ["active", "reference", "archived"];
const bytes = (value) => Buffer.byteLength(value, "utf8");

const rows = [];
for (const domain of readdirSync(domainsRoot)) {
  const plansRoot = path.join(domainsRoot, domain, "plans");
  if (!existsSync(plansRoot)) continue;
  for (const lifecycle of readdirSync(plansRoot)) {
    if (!LIFECYCLES.includes(lifecycle)) continue;
    const lifecycleRoot = path.join(plansRoot, lifecycle);
    for (const plan of readdirSync(lifecycleRoot)) {
      const directory = path.join(lifecycleRoot, plan);
      if (!statSync(directory).isDirectory()) continue;
      const notesPath = path.join(directory, "notes.json");
      if (!existsSync(notesPath)) continue;
      const document = JSON.parse(readFileSync(notesPath, "utf8"));
      const contentBytes = document.notes.reduce((sum, note) => sum + bytes(note.content), 0);
      rows.push({
        plan: `${domain}/${lifecycle}/${plan}`,
        notes: document.notes.length,
        contentBytes,
      });
    }
  }
}
const converted = rows.filter((row) => !row.plan.includes("2026-11-07-预设提示词评审"));
console.log(
  JSON.stringify(
    {
      plans: converted.length,
      notes: converted.reduce((sum, row) => sum + row.notes, 0),
      contentBytes: converted.reduce((sum, row) => sum + row.contentBytes, 0),
    },
    null,
    2,
  ),
);
