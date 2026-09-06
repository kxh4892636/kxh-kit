#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  canonicalPlanKey,
  fail,
  FLOW_SCHEMA_VERSION,
  planKey,
  withFlowStore,
} from "./flow-store.mjs";
import {
  loadDocuments,
  issueReady,
  setIssueStatus,
  blockIssue,
  hasDeliveryEvidence,
  stageDocuments,
} from "./flow-documents.mjs";

const SKILL_RESULTS = {
  questing: ["completed"],
  "to-issues": ["completed", "skipped"],
  "dev-gate": ["ready"],
  "code-delivery": ["completed"],
};
const SKILLS = Object.keys(SKILL_RESULTS);
const HOOK_SCHEMA_VERSION = 1;
const HOOKS_PATH = fileURLToPath(new URL("../extensions/hooks.json", import.meta.url));
const HOOKABLE_SKILLS = new Set(SKILLS);
const FLOW_MODES = new Set(["auto", "manual"]);
const DEFAULT_FLOW_MODE = "manual";
const normalizeSkill = (value) => value?.replace(/^\//, "");

const validateHooks = (config) => {
  if (
    config === null ||
    config.schema_version !== HOOK_SCHEMA_VERSION ||
    !Array.isArray(config.hooks)
  ) {
    fail("Hook 配置格式无效或版本不受支持");
  }
  for (const [index, hook] of config.hooks.entries()) {
    if (hook === null || typeof hook !== "object" || Array.isArray(hook)) {
      fail(`Hook ${index + 1} 格式无效`);
    }
    if (
      hook.match !== "all" &&
      (!Array.isArray(hook.match) ||
        hook.match.length === 0 ||
        hook.match.some((skill) => typeof skill !== "string" || !HOOKABLE_SKILLS.has(skill)))
    ) {
      fail(`Hook ${index + 1} 的 match 必须是 "all" 或主流程 Skill 数组`);
    }
    if (hook.mode !== undefined && hook.mode !== "all" && !FLOW_MODES.has(hook.mode)) {
      fail(`Hook ${index + 1} 的 mode 必须是 all | manual | auto`);
    }
    if (
      typeof hook.message !== "string" ||
      hook.message.trim() === "" ||
      /[\r\n]/u.test(hook.message)
    ) {
      fail(`Hook ${index + 1} 的 message 必须是非空单行字符串`);
    }
  }
  return config;
};

const loadHooks = async (hooksPath = HOOKS_PATH) => {
  let content;
  try {
    content = await fs.readFile(hooksPath, "utf8");
  } catch (error) {
    fail(
      `读取 Hook 配置 ${hooksPath} 失败: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    return validateHooks(JSON.parse(content));
  } catch (error) {
    if (error instanceof SyntaxError) fail(`解析 Hook 配置 ${hooksPath} 失败: ${error.message}`);
    throw error;
  }
};

const messageForSkill = (config, skill, mode) => {
  const normalized = normalizeSkill(skill);
  return config.hooks
    .filter((hook) => hook.match === "all" || hook.match.includes(normalized))
    .filter((hook) => hook.mode === undefined || hook.mode === "all" || hook.mode === mode)
    .map((hook) => hook.message)
    .join("\n");
};

const requireOption = (options, name) => {
  const value = options[name];
  if (typeof value !== "string" || value.trim() === "") fail(`缺少 --${name}`);
  return value.trim();
};

const evidenceOf = (options) => {
  const items =
    options.evidence === undefined
      ? []
      : Array.isArray(options.evidence)
        ? options.evidence
        : [options.evidence];
  if (items.some((item) => typeof item !== "string" || !item.trim()))
    fail("--evidence 必须是非空引用");
  return items.map((item) => item.trim());
};

const parseOptions = (command, options, workspace) => {
  const allowed = {
    status: ["plan", "issue", "session"],
    acquire: ["plan", "issue", "session", "mode", "lease-seconds", "evidence"],
    report: [
      "plan",
      "issue",
      "session",
      "step",
      "result",
      "evidence",
      "reason",
      "release-condition",
      "lease-seconds",
    ],
  };
  if (!Object.hasOwn(allowed, command)) fail(`未知命令 ${command}`);
  for (const key of Object.keys(options)) {
    if (!allowed[command].includes(key)) fail(`无法识别参数 --${key}`);
    if (key !== "evidence") requireOption(options, key);
  }
  const plan = planKey(workspace, requireOption(options, "plan"));
  const issue = options.issue?.trim() ?? null;
  if (issue !== null && !/^\d{2}$/.test(issue)) fail("--issue 必须是两位 Issue ID");
  const mode = options.mode?.trim();
  if (mode !== undefined && !FLOW_MODES.has(mode)) fail("--mode 必须是 manual | auto");
  const seconds = options["lease-seconds"] === undefined ? 1800 : Number(options["lease-seconds"]);
  if (!Number.isInteger(seconds) || seconds < 30 || seconds > 86400)
    fail("--lease-seconds 必须是 30 到 86400 之间的整数");
  const input = {
    plan,
    issue,
    mode,
    seconds,
    session: options.session?.trim() ?? null,
    evidence: evidenceOf(options),
  };
  if (command !== "report") return input;
  input.session = requireOption(options, "session");
  input.result = requireOption(options, "result");
  if (!["completed", "skipped", "ready", "paused", "blocked"].includes(input.result))
    fail("--result 必须是 completed | skipped | ready | paused | blocked");
  if (input.result === "blocked") {
    if (!issue) fail("blocked 仅适用于 Issue");
    input.reason = requireOption(options, "reason");
    input.condition = requireOption(options, "release-condition");
  } else if (input.result !== "paused") {
    input.step = `/${normalizeSkill(requireOption(options, "step"))}`;
    if (!input.evidence.length) fail(`${input.step} 至少需要一个 --evidence`);
  }
  return input;
};

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const leaseActive = (lease, now) => lease && Date.parse(lease.expires_at) > now.getTime();
const makeLease = (input, now) => ({
  owner_session: input.session,
  expires_at: new Date(now.getTime() + input.seconds * 1000).toISOString(),
});
const planReceipts = (plan) => plan.receipts.filter((receipt) => receipt.issue === null);
const planStep = (plan) => {
  const receipts = planReceipts(plan);
  if (!receipts.length) return "questing";
  if (receipts.length === 1) return "to-issues";
  if (receipts.length === 2) return "dev-gate";
  if (receipts[1].result === "completed") return "issues";
  return receipts.length === 3 ? "code-delivery" : "completed";
};

const validatePlan = (plan) => {
  if (
    !isObject(plan) ||
    !FLOW_MODES.has(plan.mode) ||
    !Array.isArray(plan.receipts) ||
    !isObject(plan.leases)
  )
    fail("Flow Plan 状态格式无效");
  const seen = { mode: plan.mode, receipts: [] };
  const completedIssues = new Set();
  for (const receipt of plan.receipts) {
    if (
      !isObject(receipt) ||
      (receipt.issue !== null &&
        (typeof receipt.issue !== "string" || !/^\d{2}$/.test(receipt.issue))) ||
      !Array.isArray(receipt.evidence) ||
      !receipt.evidence.length ||
      receipt.evidence.some((item) => typeof item !== "string" || !item.trim()) ||
      typeof receipt.recorded_at !== "string" ||
      !Number.isFinite(Date.parse(receipt.recorded_at))
    )
      fail("Flow receipt 格式无效");
    const expected = planStep(seen);
    if (receipt.issue === null) {
      if (
        receipt.step !== `/${expected}` ||
        !SKILLS.includes(expected) ||
        !SKILL_RESULTS[expected].includes(receipt.result)
      )
        fail("Flow receipt 顺序或结果无效");
    } else {
      if (
        expected !== "issues" ||
        completedIssues.has(receipt.issue) ||
        receipt.step !== "/code-delivery" ||
        receipt.result !== "completed"
      )
        fail("Flow Issue receipt 顺序或结果无效");
      completedIssues.add(receipt.issue);
    }
    seen.receipts.push(receipt);
  }
  for (const [target, lease] of Object.entries(plan.leases)) {
    if (
      (target !== "plan" && !/^\d{2}$/.test(target)) ||
      !isObject(lease) ||
      typeof lease.owner_session !== "string" ||
      !lease.owner_session.trim() ||
      typeof lease.expires_at !== "string" ||
      !Number.isFinite(Date.parse(lease.expires_at))
    )
      fail("Flow 租约格式无效");
    if (
      (target === "plan" && ["issues", "completed"].includes(planStep(plan))) ||
      (target !== "plan" && (planStep(plan) !== "issues" || completedIssues.has(target)))
    )
      fail("Flow 租约与步骤冲突");
  }
};

const validateState = (state, workspace) => {
  if (!isObject(state) || state.schema_version !== FLOW_SCHEMA_VERSION || !isObject(state.plans))
    fail(`Flow 状态格式无效或版本不受支持；需要 schema_version=${FLOW_SCHEMA_VERSION}`);
  for (const [key, plan] of Object.entries(state.plans)) {
    if (key !== planKey(workspace, key)) fail("Flow 标识无效");
    validatePlan(plan);
  }
};

const findIssue = (documents, id) => {
  const issue = documents?.issues.find((item) => item.id === id);
  if (!issue) fail(`Plan 中不存在 Issue ${id}`);
  return issue;
};

const requireLease = (lease, session, now) => {
  if (!leaseActive(lease, now)) fail("租约不存在或已经过期，请 acquire 恢复");
  if (lease.owner_session !== session) fail(`资源由会话 ${lease.owner_session} 持有`);
};

const project = (plan, documents, input, now, hooks) => {
  const issue = input.issue ? findIssue(documents, input.issue) : null;
  const step = issue
    ? issue.status === "completed"
      ? "completed"
      : "code-delivery"
    : planStep(plan);
  const done =
    step === "completed" ||
    (step === "issues" && documents.issues.every((item) => item.status === "completed"));
  const lease = done ? null : (plan.leases[input.issue ?? "plan"] ?? null);
  let state = leaseActive(lease, now)
    ? lease.owner_session === input.session
      ? "owned"
      : "busy"
    : "available";
  if (issue?.status === "blocked") state = "blocked";
  if (step === "issues") state = "issues";
  if (done) state = "completed";
  const next =
    !done && step !== "issues"
      ? {
          skill: `/${step}`,
          results: [...SKILL_RESULTS[step]],
        }
      : null;
  if (next) {
    const message = messageForSkill(hooks, next.skill, plan.mode);
    if (message) next.message = message;
  }
  return {
    plan: input.plan,
    issue: input.issue,
    session: input.session,
    mode: plan.mode,
    state,
    next,
    lease,
    issues: documents
      ? documents.issues.map((item) => ({
          id: item.id,
          status: item.status,
          lease: item.status === "completed" ? null : (plan.leases[item.id] ?? null),
          ready:
            ["pending", "in_progress"].includes(item.status) &&
            issueReady(documents, item) &&
            !leaseActive(plan.leases[item.id], now),
        }))
      : [],
    receipts: plan.receipts,
  };
};

const acquire = (plan, documents, input, now) => {
  const step = planStep(plan);
  if (!input.issue && ["issues", "completed"].includes(step)) return;
  const issue = input.issue ? findIssue(documents, input.issue) : null;
  if (issue?.status === "completed") return;
  const target = input.issue ?? "plan";
  const lease = plan.leases[target];
  if (leaseActive(lease, now) && lease.owner_session !== input.session)
    fail(`资源由会话 ${lease.owner_session} 持有`);
  input.session ??= randomUUID();
  if (issue) {
    if (!issueReady(documents, issue)) fail(`Issue ${issue.id} 的直接依赖尚未 completed`);
    if (
      Object.entries(plan.leases).some(
        ([id, other]) =>
          id !== target && leaseActive(other, now) && other.owner_session === input.session,
      )
    )
      fail("同一 session 只能持有一个 Issue");
    if (issue.status === "blocked") {
      if (!input.evidence.length) fail("解除 blocked 至少需要一个 --evidence");
      issue.content = `${issue.content.trimEnd()}\n\n- 解除证据: ${input.evidence.join("；")}\n`;
    }
    setIssueStatus(issue, "in_progress");
  }
  plan.leases[target] = makeLease(input, now);
};

const report = (plan, documents, input, now) => {
  const target = input.issue ?? "plan";
  const issue = input.issue ? findIssue(documents, input.issue) : null;
  if (issue && issue.status !== "in_progress")
    fail(`Issue ${issue.id} 当前状态 ${issue.status} 不可登记`);
  requireLease(plan.leases[target], input.session, now);
  if (input.result === "paused" || input.result === "blocked") {
    if (input.result === "blocked") blockIssue(issue, input.reason, input.condition);
    delete plan.leases[target];
    return;
  }
  const step = issue ? "code-delivery" : planStep(plan);
  if (input.step !== `/${step}`) fail(`步骤顺序错误: 期望 /${step}，实际 ${input.step}`);
  if (!SKILL_RESULTS[step].includes(input.result))
    fail(`${input.step} 的 result 必须是 ${SKILL_RESULTS[step].join(" | ")}`);
  if (issue) {
    if (!issueReady(documents, issue)) fail(`Issue ${issue.id} 的直接依赖尚未 completed`);
    if (!hasDeliveryEvidence(issue.content))
      fail(`Issue ${issue.id} 完成前必须写入交付物与验证证据`);
    setIssueStatus(issue, "completed");
  }
  plan.receipts.push({
    issue: input.issue,
    step: input.step,
    result: input.result,
    evidence: input.evidence,
    recorded_at: now.toISOString(),
  });
  if (issue || ["issues", "completed"].includes(planStep(plan))) delete plan.leases[target];
  else plan.leases[target] = makeLease(input, now);
};

export const executeFlow = async ({
  command,
  hooks,
  now = () => new Date(),
  options = {},
  workspace = process.cwd(),
}) => {
  const root = await fs.realpath(path.resolve(workspace));
  const input = parseOptions(command, options, root);
  input.plan = await canonicalPlanKey(root, input.plan);
  const config = hooks === undefined ? await loadHooks() : validateHooks(hooks);
  return withFlowStore(root, command === "status", async (store) => {
    validateState(store.state, root);
    let plan = Object.hasOwn(store.state.plans, input.plan) ? store.state.plans[input.plan] : null;
    if (!plan) {
      if (command !== "acquire" || input.issue) fail(`Plan ${input.plan} 尚未初始化`);
      plan = { mode: input.mode ?? DEFAULT_FLOW_MODE, receipts: [], leases: {} };
      Object.defineProperty(store.state.plans, input.plan, {
        value: plan,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    if (input.mode !== undefined && input.mode !== plan.mode)
      fail("Flow 模式创建后固定；新模式请使用新的 Flow 标识");
    if (input.issue && planStep(plan) !== "issues") fail("Plan 尚未进入 Issue 交付");
    let documents =
      planStep(plan) === "issues" ? await loadDocuments(store, root, input.plan) : null;
    if (documents) {
      for (const receipt of plan.receipts.filter((item) => item.issue !== null)) {
        if (findIssue(documents, receipt.issue).status !== "completed")
          fail(`Issue ${receipt.issue} 与完成 receipt 冲突；后续工作请新增 Issue`);
      }
      if (command !== "status") {
        for (const issue of documents.issues)
          if (issue.status === "completed") delete plan.leases[issue.id];
      }
    }
    const instant = now();
    if (command === "acquire") acquire(plan, documents, input, instant);
    if (command === "report") {
      report(plan, documents, input, instant);
      if (planStep(plan) === "issues" && !documents)
        documents = await loadDocuments(store, root, input.plan);
    }
    if (documents && command !== "status") await stageDocuments(store, documents);
    validatePlan(plan);
    return project(plan, documents, input, instant, config);
  });
};

const parseCli = (argumentsList) => {
  const [command = "help", ...tokens] = argumentsList;
  const options = Object.create(null);
  for (let index = 0; index < tokens.length; index += 2) {
    const token = tokens[index];
    if (!token.startsWith("--")) fail(`无法识别参数 ${token}`);
    const key = token.slice(2);
    const value = tokens[index + 1];
    if (!value || value.startsWith("--")) fail(`--${key} 缺少值`);
    if (key === "evidence") options.evidence = [...(options.evidence ?? []), value];
    else {
      if (Object.hasOwn(options, key)) fail(`重复参数 --${key}`);
      options[key] = value;
    }
  }
  return { command, options };
};

const usage = `用法:
  flow.mjs status --plan <path> [--issue <NN>] [--session <id>]
  flow.mjs acquire --plan <path> [--issue <NN>] [--session <id>] [--mode <manual|auto>] [--lease-seconds <30..86400>] [--evidence <解除阻塞证据>]
  flow.mjs report --plan <path> [--issue <NN>] --session <id> --step </questing|/to-issues|/dev-gate|/code-delivery> --result <completed|skipped|ready> --evidence <ref>
  flow.mjs report --plan <path> [--issue <NN>] --session <id> --result paused
  flow.mjs report --plan <path> --issue <NN> --session <id> --result blocked --reason <text> --release-condition <text>

acquire 统一进入、恢复及续租；report completed 表示 skill 的全部工作已完成。
/dev-gate 仅接受 ready；仅 /to-issues 接受 skipped。--evidence 可重复；所有命令可用 --workspace <path>。
`;

export const runFlowCli = async ({
  argumentsList = process.argv.slice(2),
  cwd = process.cwd(),
  stderr = (message) => console.error(message),
  stdout = (message) => process.stdout.write(message),
} = {}) => {
  try {
    const parsed = parseCli(argumentsList);
    if (["help", "--help", "-h"].includes(parsed.command)) {
      stdout(usage);
      return 0;
    }
    const workspace = parsed.options.workspace ?? cwd;
    delete parsed.options.workspace;
    const result = await executeFlow({ ...parsed, workspace });
    stdout(`${JSON.stringify({ success: true, ...result }, null, 2)}\n`);
    return 0;
  } catch (error) {
    stderr(JSON.stringify({ error: error.message, success: false }));
    return 1;
  }
};

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) process.exitCode = await runFlowCli();
