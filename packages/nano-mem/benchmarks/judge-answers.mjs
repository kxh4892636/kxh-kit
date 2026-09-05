import { resolve } from "node:path";
import {
  callModel,
  parseOrRepairJson,
  mapConcurrent,
  evalRoot,
  runRoot,
  readJson,
  writeJson,
  runProcess,
} from "./model-call.mjs";

try {
  const python = resolve(evalRoot, "venv/Scripts/python.exe");
  const scorer = resolve("packages/nano-mem/benchmarks/score-evaluation.py");
  console.log((await runProcess(python, [scorer, runRoot, "lme"])).stdout);
  const pending = await readJson(resolve(runRoot, "lme-pending-judges.json"));
  await mapConcurrent(pending, Number(process.argv[2] || 6), async (item, index) => {
    const prompt = item.messages
      .map(({ role, content }) => `${role.toUpperCase()}:\n${content}`)
      .join("\n\n");
    const result = await callModel("judges", item.id, prompt);
    const judgment = await parseOrRepairJson("judges", item.id, result.text);
    if (![0, 1].includes(judgment.label)) throw new Error(`Invalid judgment: ${item.id}`);
    await writeJson(resolve(runRoot, "judgments", `${item.id}.json`), {
      ...judgment,
      usage: result.usage,
      latencyMs: result.latencyMs,
    });
    console.log(
      JSON.stringify({ stage: "judging", completedIndex: index + 1, total: pending.length }),
    );
  });
  console.log((await runProcess(python, [scorer, runRoot, "lme"])).stdout);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
