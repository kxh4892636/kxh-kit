import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { resolve } from "node:path";
import { evalRoot, runRoot, writeJson } from "./model-call.mjs";

const status = { startedAt: new Date().toISOString(), pid: process.pid, stages: {} };
let statusWrite = Promise.resolve();
const saveStatus = () => {
  const snapshot = structuredClone(status);
  // Windows 文件替换存在共享限制，两个流水线必须串行写同一个状态文件。
  statusWrite = statusWrite.then(() => writeJson(resolve(runRoot, "run-status.json"), snapshot));
  return statusWrite;
};
const launch = (command, args, name, attempt) =>
  new Promise((accept, reject) => {
    const stdout = createWriteStream(resolve(runRoot, `${name}-${attempt}.stdout.log`));
    const stderr = createWriteStream(resolve(runRoot, `${name}-${attempt}.stderr.log`));
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.pipe(stdout);
    child.stderr.pipe(stderr);
    child.on("error", reject);
    child.on("close", (code) => {
      stdout.end();
      stderr.end();
      if (code === 0) accept();
      else reject(new Error(`${name} exit ${code}; see ${name}-${attempt}.stderr.log`));
    });
  });

const stage = async (name, command, args) => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    status.stages[name] = { state: "running", attempt, startedAt: new Date().toISOString() };
    await saveStatus();
    console.log(JSON.stringify({ stage: name, state: "running", attempt }));
    try {
      await launch(command, args, name, attempt);
      status.stages[name] = {
        ...status.stages[name],
        state: "complete",
        finishedAt: new Date().toISOString(),
      };
      await saveStatus();
      return;
    } catch (error) {
      status.stages[name] = { ...status.stages[name], state: "failed", error: error.message };
      await saveStatus();
      if (attempt === 3) throw error;
    }
  }
};

const script = (name) => resolve("packages/nano-mem/benchmarks", name);
const pipeline = async (benchmark, concurrency) => {
  await stage(`${benchmark}-ingest`, process.execPath, [
    script("run-benchmark.mjs"),
    "ingest",
    benchmark,
    "Infinity",
    String(concurrency),
  ]);
  await stage(`${benchmark}-answer`, process.execPath, [
    script("run-benchmark.mjs"),
    "answer",
    benchmark,
    "Infinity",
    String(concurrency),
  ]);
  if (benchmark === "lme")
    await stage("lme-judge", process.execPath, [script("judge-answers.mjs"), String(concurrency)]);
  else
    await stage("locomo-score", resolve(evalRoot, "venv/Scripts/python.exe"), [
      script("score-evaluation.py"),
      runRoot,
      "locomo",
    ]);
};

try {
  const outcomes = await Promise.allSettled([pipeline("locomo", 8), pipeline("lme", 24)]);
  await stage("usage-summary", process.execPath, [script("experiment-record.mjs"), "summary"]);
  status.state = outcomes.every((outcome) => outcome.status === "fulfilled")
    ? "complete"
    : "failed";
  status.errors = outcomes
    .filter((outcome) => outcome.status === "rejected")
    .map((outcome) => String(outcome.reason));
  status.finishedAt = new Date().toISOString();
  await saveStatus();
  if (status.state === "failed") process.exitCode = 1;
} catch (error) {
  status.state = "failed";
  status.error = error.message;
  await saveStatus();
  console.error(error);
  process.exitCode = 1;
}
