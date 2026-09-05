import { createHash } from "node:crypto";
import { readdir, readFile, stat, mkdir, rename } from "node:fs/promises";
import { resolve, sep, dirname } from "node:path";
import {
  evalRoot,
  runRoot,
  readJson,
  writeJson,
  model,
  effort,
  runProcess,
} from "./model-call.mjs";

const mean = (values) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const percentile = (values, fraction) =>
  values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1] : null;
const digest = (content) => createHash("sha256").update(content).digest("hex");

const manifest = async () => {
  const revisions = {};
  for (const [name, directory] of [
    ["nanoMem", "."],
    ["longMemEvalV2", resolve(evalRoot, "longmemeval-v2")],
    ["locomo", resolve(evalRoot, "locomo")],
  ]) {
    revisions[name] = (
      await runProcess("git", ["-C", directory, "rev-parse", "HEAD"])
    ).stdout.trim();
  }
  revisions.lmeDataset = (await readJson(resolve(evalRoot, "data/lme-v2/revision.json"))).sha;
  const sourceHashes = {};
  for (const name of await readdir("packages/nano-mem/benchmarks")) {
    if (!/\.(mjs|py)$/u.test(name)) continue;
    sourceHashes[name] = digest(await readFile(resolve("packages/nano-mem/benchmarks", name)));
  }
  const record = {
    model,
    effort,
    revisions,
    sourceHashes,
    runRoot,
    protocol: {
      lmeTier: "small",
      lmeQuestions: 451,
      locomoQuestions: 1986,
      sourceChunkCharacters: 180000,
      maxMemoriesPerChunk: 80,
      maxMemoryCharacters: 1600,
      queryCount: "1-3",
      perQueryTopK: 5,
      memoryClock: "2026-09-05T00:00:00.000Z",
      memoryId: "sha256(group + newline + content)",
      isolatedSqlite: true,
      queryOnlyConnections: true,
      queryIndependentSnapshots: true,
      ingestion: "independent grounded fact extraction; exact duplicate handling by nano-mem",
      lifecycle: "fixed initial state; no use/update/forget during QA",
      lmeModalities:
        "all trajectory text, actions and thoughts; query images included; trajectory screenshots excluded",
      locomoModalities:
        "dialogue turns and released image captions; no supplied summaries or observations",
      scoring:
        "upstream deterministic functions; upstream LME judge prompts via Codex with same model/effort",
      modelTransport: "Codex exec, existing ChatGPT login, fresh ephemeral turns, no tools",
      rawHistoryAtAnswerTime: false,
      groundTruthAtIngestionOrRetrieval: false,
    },
    recordedAt: new Date().toISOString(),
  };
  await writeJson(resolve(runRoot, "manifest.json"), record);
  return record;
};

const summary = async () => {
  const files = await readdir(resolve(runRoot, "calls"), { recursive: true });
  const stages = {};
  for (const name of files.filter((name) => name.endsWith("result.json"))) {
    const result = await readJson(resolve(runRoot, "calls", name));
    const stage = name.split(/[\\/]/u)[0];
    const target = (stages[stage] ??= {
      calls: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      latencies: [],
    });
    target.calls++;
    target.inputTokens += result.usage.input_tokens;
    target.cachedInputTokens += result.usage.cached_input_tokens ?? 0;
    target.outputTokens += result.usage.output_tokens;
    target.reasoningOutputTokens += result.usage.reasoning_output_tokens ?? 0;
    if (typeof result.latencyMs === "number") target.latencies.push(result.latencyMs);
    else target.unknownLatencyCalls = (target.unknownLatencyCalls ?? 0) + 1;
  }
  for (const stage of Object.values(stages)) {
    stage.meanLatencyMs = mean(stage.latencies);
    stage.p95LatencyMs = percentile(stage.latencies, 0.95);
    delete stage.latencies;
  }
  const record = {
    model,
    effort,
    stages,
    monetaryCost: null,
    monetaryCostReason:
      "ChatGPT-authenticated Codex calls; no API invoice or verified per-token billing available",
    failedAttempts: files.filter((name) => /failed-attempt-\d+\.txt$/u.test(name)).length,
    recordedAt: new Date().toISOString(),
  };
  await writeJson(resolve(runRoot, "usage-summary.json"), record);
  return record;
};

const recoverTransportEvents = async () => {
  const recovered = [];
  const questions = await readJson(resolve(runRoot, "lme-questions.json"));
  const imagesById = new Map(questions.map((question) => [question.id, question.image]));
  const files = await readdir(resolve(runRoot, "calls"), { recursive: true });
  for (const name of files.filter((name) => name.endsWith("events.jsonl"))) {
    const directory = resolve(runRoot, "calls", name, "..");
    try {
      await stat(resolve(directory, "result.json"));
      continue;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (Date.now() - (await stat(resolve(directory, "events.jsonl"))).mtimeMs < 120000) continue;
    const events = (await readFile(resolve(directory, "events.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map(JSON.parse);
    const completed = events.findLast((event) => event.type === "turn.completed");
    const items = events
      .filter((event) => event.type === "item.completed")
      .map((event) => event.item);
    if (
      !completed ||
      items.some((item) => !["agent_message", "reasoning", "error"].includes(item.type))
    )
      continue;
    if (
      !items.some(
        (item) =>
          item.type === "error" && item.message.startsWith("Falling back from WebSockets to HTTPS"),
      )
    )
      continue;
    const [stage, folder] = name.split(/[\\/]/u);
    const key = folder.replace(/-[a-f0-9]{12}$/u, "");
    const image = ["answers", "queries"].includes(stage) ? imagesById.get(key) : null;
    const prompt = await readFile(resolve(directory, "prompt.txt"), "utf8");
    const baseInstructions = await readFile(resolve(directory, "instructions.txt"), "utf8");
    const hash = digest(
      JSON.stringify({ prompt, images: image ? [image] : [], baseInstructions, model, effort }),
    );
    if (!folder.endsWith(hash.slice(0, 12))) throw new Error(`Recovery digest mismatch: ${folder}`);
    const text = await readFile(resolve(directory, "output.txt"), "utf8");
    if (items.findLast((item) => item.type === "agent_message")?.text.trim() !== text.trim())
      throw new Error(`Recovery response mismatch: ${folder}`);
    await writeJson(resolve(directory, "result.json"), {
      digest: hash,
      model,
      reasoningEffort: effort,
      text,
      usage: completed.usage,
      latencyMs: null,
      recoveredFromEvents: true,
      recoveryReason:
        "Transport fallback event misclassified as tool use; original completed response retained",
    });
    recovered.push(folder);
  }
  return { recovered };
};

const reconcileOverlappingAnswers = async () => {
  const status = await readJson(resolve(runRoot, "run-status.json"));
  if (status.state !== "complete") throw new Error("Wait for the original runner to finish");
  const idsFromLog = async (name) =>
    (await readFile(resolve(runRoot, name), "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line).id);
  const main = new Set([
    ...(await idsFromLog("lme-answer-1.stdout.log")),
    ...(await idsFromLog("lme-answer-2.stdout.log")),
  ]);
  const ids = (await idsFromLog("lme-answer-tail.stdout.log")).filter((id) => main.has(id));
  const moveInsideRun = async (from, to) => {
    const source = resolve(runRoot, from);
    const target = resolve(runRoot, to);
    if (![source, target].every((path) => path.startsWith(`${runRoot}${sep}`)))
      throw new Error("Archive path escaped the experiment directory");
    try {
      await stat(source);
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    await mkdir(dirname(target), { recursive: true });
    await rename(source, target);
  };
  for (const stage of ["queries", "answers", "judges"]) {
    const folders = await readdir(resolve(runRoot, "calls", stage));
    for (const folder of folders.filter((name) => ids.some((id) => name.startsWith(`${id}-`))))
      await moveInsideRun(`calls/${stage}/${folder}`, `calls/superseded-${stage}/${folder}`);
  }
  for (const id of ids) {
    for (const stage of ["predictions", "judgments"])
      await moveInsideRun(`${stage}/${id}.json`, `superseded-${stage}/${id}.json`);
  }
  await writeJson(resolve(runRoot, "pre-reconciliation-status.json"), status);
  const record = {
    ids,
    count: ids.length,
    reason: "Rerun every queue intersection once; selection is independent of scores",
    archivedUsage: "Included where retained; overwritten concurrent attempt usage is unknown",
    recordedAt: new Date().toISOString(),
  };
  await writeJson(resolve(runRoot, "concurrent-answer-overlap.json"), record);
  await writeJson(resolve(runRoot, "run-status.json"), { ...status, state: "reconciling" });
  return record;
};

try {
  console.log(
    JSON.stringify(
      await (process.argv[2] === "manifest"
        ? manifest()
        : process.argv[2] === "recover"
          ? recoverTransportEvents()
          : process.argv[2] === "reconcile"
            ? reconcileOverlappingAnswers()
            : summary()),
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
