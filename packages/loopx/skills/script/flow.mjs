#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const SCHEMA_VERSION = 1;
const DEFAULT_LEASE_SECONDS = 1800;
const LOCK_STALE_MS = 30000;
const LOCK_RETRIES = 50;
const LOCK_RETRY_MS = 100;
const ISSUE_STATUSES = new Set(["pending", "in_progress", "blocked", "completed"]);

const DELIVERY_FLOW = [
  { skill: "implement", results: ["started"] },
  { skill: "tdd", results: ["completed", "skipped"] },
  { skill: "verifying", results: ["passed"] },
  { skill: "code-review", results: ["reviewed"] },
  { action: "commit", results: ["committed"] },
];

const PLAN_ROUTES = {
  main: [
    { skill: "grill-with-docs", results: ["completed"] },
    { skill: "dev-gate", results: ["ready"] },
    ...DELIVERY_FLOW,
  ],
  story: [
    { skill: "to-story", results: ["completed"] },
    { skill: "to-issues", results: ["completed"] },
    { skill: "dev-gate", results: ["ready"] },
  ],
  issues: [
    { skill: "to-issues", results: ["completed"] },
    { skill: "dev-gate", results: ["ready"] },
  ],
};

const ISSUE_FLOW = DELIVERY_FLOW;

const ENTRY_ROUTES = {
  "grill-with-docs": "main",
  "to-issues": "issues",
  "to-story": "story",
};

const fail = (message) => {
  throw new Error(message);
};

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const normalizeSkill = (value) => value?.replace(/^\//, "");

const requireOption = (options, name) => {
  const value = options[name];
  if (typeof value !== "string" || value.trim() === "") {
    fail(`缺少 --${name}`);
  }
  return value.trim();
};

const optionValues = (options, name) => {
  const value = options[name];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  return [];
};

const leaseSeconds = (options) => {
  const rawValue = options["lease-seconds"];
  if (rawValue === undefined) return DEFAULT_LEASE_SECONDS;
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 30 || value > 86400) {
    fail("--lease-seconds 必须是 30 到 86400 之间的整数");
  }
  return value;
};

const normalizePlanPath = (workspace, planInput) => {
  const absolutePath = path.resolve(workspace, planInput);
  const relativePath = path.relative(workspace, absolutePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    fail("--plan 必须位于工作区内");
  }
  return relativePath === "" ? "." : relativePath.replaceAll("\\", "/");
};

const statePaths = (workspace) => ({
  lock: path.join(workspace, ".loop.lock"),
  state: path.join(workspace, ".loop"),
});

const emptyState = () => ({
  plans: {},
  revision: 0,
  schema_version: SCHEMA_VERSION,
});

const validateState = (state) => {
  if (
    state === null ||
    typeof state !== "object" ||
    state.schema_version !== SCHEMA_VERSION ||
    !Number.isInteger(state.revision) ||
    state.plans === null ||
    typeof state.plans !== "object" ||
    Array.isArray(state.plans)
  ) {
    fail(".loop 格式无效或版本不受支持");
  }
  return state;
};

const readText = async (targetPath, allowMissing = false) => {
  try {
    return await fs.readFile(targetPath, "utf8");
  } catch (error) {
    if (allowMissing && error?.code === "ENOENT") return null;
    fail(`读取 ${targetPath} 失败: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const readState = async (statePath) => {
  const content = await readText(statePath, true);
  if (content === null) return emptyState();
  try {
    return validateState(JSON.parse(content));
  } catch (error) {
    if (error instanceof SyntaxError) fail(`解析 ${statePath} 失败: ${error.message}`);
    throw error;
  }
};

const atomicWrite = async (targetPath, content) => {
  const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(temporaryPath, "wx");
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporaryPath, targetPath);
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    await fs.unlink(temporaryPath).catch(() => undefined);
    fail(`写入 ${targetPath} 失败: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const acquireLock = async (lockPath, now) => {
  for (let attempt = 0; attempt < LOCK_RETRIES; attempt += 1) {
    const nonce = randomUUID();
    try {
      const handle = await fs.open(lockPath, "wx");
      await handle.writeFile(
        JSON.stringify({ acquired_at: now().toISOString(), nonce, pid: process.pid }),
        "utf8",
      );
      await handle.sync();
      await handle.close();
      return nonce;
    } catch (error) {
      if (error?.code !== "EEXIST") {
        fail(`取得 ${lockPath} 失败: ${error instanceof Error ? error.message : String(error)}`);
      }
      try {
        const stat = await fs.stat(lockPath);
        if (now().getTime() - stat.mtimeMs > LOCK_STALE_MS) {
          await fs.unlink(lockPath).catch(() => undefined);
          continue;
        }
      } catch (statError) {
        if (statError?.code !== "ENOENT") {
          fail(`检查 ${lockPath} 失败: ${statError.message}`);
        }
      }
      await sleep(LOCK_RETRY_MS);
    }
  }
  fail(`等待 ${lockPath} 超时`);
};

const releaseLock = async (lockPath, nonce) => {
  try {
    const content = await fs.readFile(lockPath, "utf8");
    const lock = JSON.parse(content);
    if (lock.nonce === nonce) await fs.unlink(lockPath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error(`释放 ${lockPath} 失败: ${error.message}`);
    }
  }
};

const withStateTransaction = async (workspace, now, action) => {
  const paths = statePaths(workspace);
  const nonce = await acquireLock(paths.lock, now);
  try {
    const state = await readState(paths.state);
    const transaction = await action(state);
    if (transaction.changed) {
      state.revision += 1;
      await atomicWrite(paths.state, `${JSON.stringify(state, null, 2)}\n`);
    }
    return { ...transaction.output, revision: state.revision };
  } finally {
    await releaseLock(paths.lock, nonce);
  }
};

const makeLease = (session, seconds, now) => ({
  expires_at: new Date(now.getTime() + seconds * 1000).toISOString(),
  owner_session: session,
});

const leaseIsActive = (lease, now) =>
  lease?.owner_session && Date.parse(lease.expires_at) > now.getTime();

const requireLease = (subject, session, now) => {
  if (!leaseIsActive(subject.lease, now)) fail("租约不存在或已经过期");
  if (subject.lease.owner_session !== session) {
    fail(`资源由会话 ${subject.lease.owner_session} 持有`);
  }
};

const nextStep = (sequence, cursor) => sequence[cursor] ?? null;

const stepLabel = (step) => (step.skill ? `/${step.skill}` : step.action);

const stepOutput = (step) => {
  if (!step) return { next_action: null, next_skill: null };
  if (step.skill) return { next_action: null, next_skill: `/${step.skill}` };
  return { next_action: step.action, next_skill: null };
};

const publicPlan = (plan) => ({
  issues: plan.issues,
  plan_path: plan.plan_path,
  route: plan.route,
  setup: plan.setup,
});

const parseFrontmatter = (content, targetPath) => {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) fail(`${targetPath} 缺少 YAML frontmatter`);
  const fields = new Map();
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([a-z_]+):\s*(.*)$/);
    if (field) fields.set(field[1], field[2].trim());
  }
  return { fields, match };
};

const replaceFrontmatterField = (content, field, value, targetPath) => {
  const parsed = parseFrontmatter(content, targetPath);
  const fieldPattern = new RegExp(`^${field}:\\s*.*$`, "m");
  if (!fieldPattern.test(parsed.match[1])) fail(`${targetPath} 缺少 ${field}`);
  const frontmatter = parsed.match[1].replace(fieldPattern, `${field}: ${value}`);
  return content.replace(parsed.match[0], `---\n${frontmatter}\n---\n`);
};

const parseDependencies = (rawValue, targetPath) => {
  try {
    const value = JSON.parse(rawValue ?? "");
    if (!Array.isArray(value) || value.some((item) => !/^\d{2}$/.test(item))) {
      fail(`${targetPath} 的 blocked_by 必须是两位 Issue ID 的 JSON 数组`);
    }
    return value;
  } catch (error) {
    if (error instanceof SyntaxError) fail(`${targetPath} 的 blocked_by 不是有效 JSON`);
    throw error;
  }
};

const issueFiles = async (planPath) => {
  try {
    return (await fs.readdir(planPath, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /^\d{2}-.+\.md$/.test(entry.name))
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  } catch (error) {
    fail(`枚举 Plan ${planPath} 失败: ${error.message}`);
  }
};

const readIssues = async (planPath) => {
  const snapshots = [];
  for (const entry of await issueFiles(planPath)) {
    const issuePath = path.join(planPath, entry.name);
    const content = await readText(issuePath);
    const frontmatter = parseFrontmatter(content, issuePath).fields;
    const status = frontmatter.get("status");
    if (!ISSUE_STATUSES.has(status)) fail(`${issuePath} 的 status 无效`);
    snapshots.push({
      content,
      dependencies: parseDependencies(frontmatter.get("blocked_by"), issuePath),
      file_name: entry.name,
      id: entry.name.slice(0, 2),
      path: issuePath,
      status,
    });
  }
  if (snapshots.length === 0) fail(`${planPath} 没有 Issue 文件`);
  return snapshots;
};

const deriveSpecStatus = (issues) => {
  if (issues.every((issue) => issue.status === "pending")) return "pending";
  if (issues.every((issue) => issue.status === "completed")) return "completed";
  return "in_progress";
};

const updateSpecView = async (planPath, issues) => {
  const specPath = path.join(planPath, "spec.md");
  let content = await readText(specPath);
  content = replaceFrontmatterField(content, "status", deriveSpecStatus(issues), specPath);
  for (const issue of issues) {
    const rowPattern = new RegExp(
      `^(\\|\\s*${issue.id}\\s*\\|\\s*\\[[^\\]]+\\]\\([^)]+\\)\\s*\\|\\s*)(pending|in_progress|blocked|completed)(\\s*\\|.*)$`,
      "m",
    );
    if (!rowPattern.test(content)) fail(`${specPath} 的 Issue 表缺少 ${issue.id}`);
    content = content.replace(rowPattern, `$1${issue.status}$3`);
  }
  await atomicWrite(specPath, content);
};

const transitionIssue = async (planPath, issueId, targetStatus, transformBody) => {
  const issues = await readIssues(planPath);
  const issue = issues.find((item) => item.id === issueId);
  if (!issue) fail(`Plan 中不存在 Issue ${issueId}`);
  let content = replaceFrontmatterField(issue.content, "status", targetStatus, issue.path);
  if (transformBody) content = transformBody(content);
  await atomicWrite(issue.path, content);
  issue.content = content;
  issue.status = targetStatus;
  await updateSpecView(planPath, issues);
  return issue;
};

const requireIssueReady = async (planPath, issueId) => {
  const issues = await readIssues(planPath);
  const issue = issues.find((item) => item.id === issueId);
  if (!issue) fail(`Plan 中不存在 Issue ${issueId}`);
  if (!["pending", "blocked", "in_progress"].includes(issue.status)) {
    fail(`Issue ${issueId} 当前状态 ${issue.status} 不可领取`);
  }
  for (const dependencyId of issue.dependencies) {
    const dependency = issues.find((item) => item.id === dependencyId);
    if (dependency?.status !== "completed") {
      fail(`Issue ${issueId} 的直接依赖 ${dependencyId} 尚未 completed`);
    }
  }
  return issue;
};

const blockedBody = (content, reason, releaseCondition) => {
  const section = `## 阻塞记录\n\n- 障碍: ${reason}\n- 解除条件: ${releaseCondition}\n`;
  const pattern = /^## 阻塞记录\r?\n[\s\S]*?(?=^## |(?![\s\S]))/m;
  if (pattern.test(content)) return content.replace(pattern, section);
  return `${content.trimEnd()}\n\n${section}`;
};

const hasDeliveryEvidence = (content) => {
  const section = content.match(/^## (?:交付记录|交付物与证据)\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  if (!section) return false;
  const body = section[1]
    .split(/\r?\n/)
    .filter((line) => !/^\s*\{.*\}\s*$/.test(line))
    .join("\n")
    .trim();
  return body.length > 0 && body.includes("交付物") && body.includes("证据");
};

const recordReceipt = (subject, sequence, options, now) => {
  const expected = nextStep(sequence, subject.cursor);
  if (!expected) fail("当前流程已经没有待执行 skill");
  const actual = expected.skill
    ? `/${normalizeSkill(requireOption(options, "skill"))}`
    : requireOption(options, "action");
  if (actual !== stepLabel(expected)) {
    fail(`步骤顺序错误: 期望 ${stepLabel(expected)}, 实际 ${actual}`);
  }
  const result = requireOption(options, "result");
  if (!expected.results.includes(result)) {
    fail(`${stepLabel(expected)} 的 result 必须是 ${expected.results.join(" | ")}`);
  }
  const evidence = optionValues(options, "evidence").filter(Boolean);
  if (evidence.length === 0) fail(`${stepLabel(expected)} 至少需要一个 --evidence`);
  if (expected.skill === "tdd" && result === "skipped" && !options.reason) {
    fail("跳过 /tdd 必须提供 --reason");
  }
  subject.receipts.push({
    evidence,
    kind: expected.skill ? "skill" : "action",
    reason: options.reason ?? null,
    recorded_at: now.toISOString(),
    result,
    step: stepLabel(expected),
  });
  subject.cursor += 1;
  return nextStep(sequence, subject.cursor);
};

const handleInit = (state, workspace, options, now) => {
  const planInput = requireOption(options, "plan");
  const planKey = normalizePlanPath(workspace, planInput);
  const route = requireOption(options, "route");
  const session = requireOption(options, "session");
  if (!PLAN_ROUTES[route]) fail("--route 必须是 main | story | issues");
  if (state.plans[planKey]) fail(`Plan ${planKey} 已经初始化`);
  state.plans[planKey] = {
    issues: {},
    plan_path: planKey,
    route,
    setup: {
      cursor: 0,
      lease: makeLease(session, leaseSeconds(options), now),
      receipts: [],
      status: "active",
    },
  };
  return {
    changed: true,
    output: {
      ...stepOutput(PLAN_ROUTES[route][0]),
      plan: planKey,
      route,
      session,
      status: "active",
    },
  };
};

const handleEnterPlan = (state, workspace, options, now) => {
  const skill = normalizeSkill(requireOption(options, "skill"));
  const entryRoute = ENTRY_ROUTES[skill];
  if (!entryRoute) {
    fail("--skill 必须是 /grill-with-docs | /to-story | /to-issues");
  }
  const defaultPlan = skill === "grill-with-docs" ? "." : null;
  const planInput = options.plan === undefined ? defaultPlan : requireOption(options, "plan");
  if (!planInput) fail(`/${skill} 进入流程前必须提供 --plan`);
  const planKey = normalizePlanPath(workspace, planInput);
  let plan = state.plans[planKey];
  if (plan?.setup.status === "completed" && entryRoute === "main") {
    delete state.plans[planKey];
    plan = null;
  }
  if (!plan) {
    const session = options.session?.trim() || randomUUID();
    return handleInit(
      state,
      workspace,
      { ...options, plan: planKey, route: entryRoute, session },
      now,
    );
  }
  const expected = nextStep(PLAN_ROUTES[plan.route], plan.setup.cursor);
  if (!expected || expected.skill !== skill) {
    fail(
      `Plan ${planKey} 当前期望 ${expected ? stepLabel(expected) : "无后续 skill"}，不能进入 /${skill}`,
    );
  }
  const requestedSession = options.session?.trim();
  if (leaseIsActive(plan.setup.lease, now)) {
    if (!requestedSession || plan.setup.lease.owner_session !== requestedSession) {
      fail(`资源由会话 ${plan.setup.lease.owner_session} 持有`);
    }
    return {
      changed: false,
      output: {
        ...stepOutput(expected),
        plan: planKey,
        route: plan.route,
        session: requestedSession,
        status: plan.setup.status,
      },
    };
  }
  const session = requestedSession || randomUUID();
  plan.setup.lease = makeLease(session, leaseSeconds(options), now);
  return {
    changed: true,
    output: {
      ...stepOutput(expected),
      plan: planKey,
      route: plan.route,
      session,
      status: plan.setup.status,
    },
  };
};

const handleRecordPlan = (state, workspace, options, now) => {
  const planKey = normalizePlanPath(workspace, requireOption(options, "plan"));
  const plan = state.plans[planKey];
  if (!plan) fail(`Plan ${planKey} 尚未初始化`);
  const session = requireOption(options, "session");
  requireLease(plan.setup, session, now);
  const next = recordReceipt(plan.setup, PLAN_ROUTES[plan.route], options, now);
  if (next) {
    plan.setup.lease = makeLease(session, leaseSeconds(options), now);
  } else {
    plan.setup.lease = null;
    plan.setup.status = plan.route === "main" ? "completed" : "ready";
  }
  return {
    changed: true,
    output: { ...stepOutput(next), plan: planKey, status: plan.setup.status },
  };
};

const handleClaimIssue = async (state, workspace, options, now) => {
  const planKey = normalizePlanPath(workspace, requireOption(options, "plan"));
  const issueId = requireOption(options, "issue");
  const requestedSession = options.session?.trim();
  if (!/^\d{2}$/.test(issueId)) fail("--issue 必须是两位 Issue ID");
  const plan = state.plans[planKey];
  if (!plan || plan.setup.status !== "ready") fail(`Plan ${planKey} 尚未通过 /dev-gate`);
  const issueState = plan.issues[issueId];
  if (issueState?.status === "completed") fail(`Issue ${issueId} 已完成`);
  if (issueState?.status === "active" && leaseIsActive(issueState.lease, now)) {
    if (requestedSession && issueState.lease.owner_session === requestedSession) {
      return {
        changed: false,
        output: {
          issue: issueId,
          ...stepOutput(nextStep(ISSUE_FLOW, issueState.cursor)),
          plan: planKey,
          session: requestedSession,
        },
      };
    }
    fail(`Issue ${issueId} 由会话 ${issueState.lease.owner_session} 持有`);
  }
  const session = requestedSession || randomUUID();
  const planPath = path.resolve(workspace, planKey);
  await requireIssueReady(planPath, issueId);
  await transitionIssue(planPath, issueId, "in_progress");
  plan.issues[issueId] = {
    cursor: issueState?.cursor ?? 0,
    lease: makeLease(session, leaseSeconds(options), now),
    receipts: issueState?.receipts ?? [],
    status: "active",
  };
  const next = nextStep(ISSUE_FLOW, plan.issues[issueId].cursor);
  return {
    changed: true,
    output: { issue: issueId, ...stepOutput(next), plan: planKey, session },
  };
};

const handleRecordIssue = async (state, workspace, options, now) => {
  const planKey = normalizePlanPath(workspace, requireOption(options, "plan"));
  const issueId = requireOption(options, "issue");
  const session = requireOption(options, "session");
  const plan = state.plans[planKey];
  const issueState = plan?.issues[issueId];
  if (!issueState || issueState.status !== "active") fail(`Issue ${issueId} 未被领取`);
  requireLease(issueState, session, now);
  const next = recordReceipt(issueState, ISSUE_FLOW, options, now);
  if (next) {
    issueState.lease = makeLease(session, leaseSeconds(options), now);
  } else {
    const planPath = path.resolve(workspace, planKey);
    const issue = (await readIssues(planPath)).find((item) => item.id === issueId);
    if (!issue || !hasDeliveryEvidence(issue.content)) {
      fail(`Issue ${issueId} 完成前必须写入交付物与验证证据`);
    }
    await transitionIssue(planPath, issueId, "completed");
    issueState.lease = null;
    issueState.status = "completed";
  }
  return {
    changed: true,
    output: { issue: issueId, ...stepOutput(next), plan: planKey, status: issueState.status },
  };
};

const handleBlockIssue = async (state, workspace, options, now) => {
  const planKey = normalizePlanPath(workspace, requireOption(options, "plan"));
  const issueId = requireOption(options, "issue");
  const session = requireOption(options, "session");
  const reason = requireOption(options, "reason");
  const releaseCondition = requireOption(options, "release-condition");
  const issueState = state.plans[planKey]?.issues[issueId];
  if (!issueState || issueState.status !== "active") fail(`Issue ${issueId} 未被领取`);
  requireLease(issueState, session, now);
  await transitionIssue(path.resolve(workspace, planKey), issueId, "blocked", (content) =>
    blockedBody(content, reason, releaseCondition),
  );
  issueState.block = { reason, release_condition: releaseCondition };
  issueState.lease = null;
  issueState.status = "blocked";
  return { changed: true, output: { issue: issueId, plan: planKey, status: "blocked" } };
};

const handleLeaseCommand = (state, workspace, command, options, now) => {
  const planKey = normalizePlanPath(workspace, requireOption(options, "plan"));
  const session = requireOption(options, "session");
  const plan = state.plans[planKey];
  if (!plan) fail(`Plan ${planKey} 尚未初始化`);
  const isIssue = command.endsWith("-issue");
  const issueId = isIssue ? requireOption(options, "issue") : null;
  const subject = isIssue ? plan.issues[issueId] : plan.setup;
  if (!subject) fail(isIssue ? `Issue ${issueId} 没有运行态` : "Plan 没有运行态");
  if (command.startsWith("heartbeat")) {
    requireLease(subject, session, now);
    subject.lease = makeLease(session, leaseSeconds(options), now);
  } else if (command.startsWith("release")) {
    requireLease(subject, session, now);
    subject.lease = null;
    if (isIssue) subject.status = "paused";
  } else {
    if (subject.status === "completed" || (plan.setup.status === "ready" && !isIssue)) {
      fail("已完成的流程不可重新领取");
    }
    if (leaseIsActive(subject.lease, now)) {
      fail(`资源由会话 ${subject.lease.owner_session} 持有`);
    }
    subject.lease = makeLease(session, leaseSeconds(options), now);
    if (isIssue) subject.status = "active";
  }
  const sequence = isIssue ? ISSUE_FLOW : PLAN_ROUTES[plan.route];
  const next = nextStep(sequence, subject.cursor);
  return {
    changed: true,
    output: { issue: issueId, ...stepOutput(next), plan: planKey, status: subject.status },
  };
};

const handleSyncPlan = async (state, workspace, options) => {
  const planKey = normalizePlanPath(workspace, requireOption(options, "plan"));
  const planPath = path.resolve(workspace, planKey);
  const issues = await readIssues(planPath);
  await updateSpecView(planPath, issues);
  const plan = state.plans[planKey];
  if (!plan) return { changed: false, output: { plan: planKey, synced: true } };
  let changed = false;
  for (const issue of issues) {
    const runtime = plan.issues[issue.id];
    if (issue.status === "pending" && runtime) {
      delete plan.issues[issue.id];
      changed = true;
    } else if (issue.status === "completed" && runtime?.status !== "completed") {
      plan.issues[issue.id] = {
        cursor: ISSUE_FLOW.length,
        lease: null,
        receipts: runtime?.receipts ?? [],
        status: "completed",
      };
      changed = true;
    } else if (issue.status === "blocked" && runtime?.status !== "blocked") {
      plan.issues[issue.id] = {
        cursor: runtime?.cursor ?? 0,
        lease: null,
        receipts: runtime?.receipts ?? [],
        status: "blocked",
      };
      changed = true;
    } else if (issue.status === "in_progress" && !runtime) {
      plan.issues[issue.id] = {
        cursor: 0,
        lease: null,
        receipts: [],
        status: "paused",
      };
      changed = true;
    }
  }
  return { changed, output: { plan: planKey, synced: true } };
};

const handleStatus = (state, workspace, options) => {
  if (!options.plan) return { changed: false, output: { plans: state.plans } };
  const planKey = normalizePlanPath(workspace, options.plan);
  const plan = state.plans[planKey];
  if (!plan) fail(`Plan ${planKey} 尚未初始化`);
  return { changed: false, output: { plan: publicPlan(plan) } };
};

const dispatch = async (state, workspace, command, options, now) => {
  if (command === "init") return handleInit(state, workspace, options, now);
  if (command === "enter-plan") return handleEnterPlan(state, workspace, options, now);
  if (command === "record-plan") return handleRecordPlan(state, workspace, options, now);
  if (command === "claim-issue") return handleClaimIssue(state, workspace, options, now);
  if (command === "resume-issue") return handleClaimIssue(state, workspace, options, now);
  if (command === "record-issue") return handleRecordIssue(state, workspace, options, now);
  if (command === "block-issue") return handleBlockIssue(state, workspace, options, now);
  if (command === "status") return handleStatus(state, workspace, options);
  if (
    ["heartbeat-plan", "release-plan", "claim-plan", "heartbeat-issue", "release-issue"].includes(
      command,
    )
  ) {
    return handleLeaseCommand(state, workspace, command, options, now);
  }
  if (command === "sync-plan") return handleSyncPlan(state, workspace, options);
  fail(`未知命令 ${command}`);
};

export const executeFlow = async ({
  command,
  now = () => new Date(),
  options = {},
  workspace = process.cwd(),
}) => {
  const root = path.resolve(workspace);
  return withStateTransaction(root, now, (state) => dispatch(state, root, command, options, now()));
};

const parseCli = (argumentsList) => {
  const [command, ...tokens] = argumentsList;
  if (!command) return { command: "help", options: {} };
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) fail(`无法识别参数 ${token}`);
    const name = token.slice(2);
    const value = tokens[index + 1];
    if (!value || value.startsWith("--")) fail(`--${name} 缺少值`);
    index += 1;
    if (name === "evidence") {
      options.evidence = [...(options.evidence ?? []), value];
    } else {
      options[name] = value;
    }
  }
  return { command, options };
};

const usage = `用法:
  flow.mjs init --plan <path> --route <main|story|issues> --session <id>
  flow.mjs enter-plan [--plan <path>] --skill </grill-with-docs|/to-story|/to-issues> [--session <id>]
  flow.mjs record-plan --plan <path> --session <id> (--skill </skill>|--action <action>) --result <result> --evidence <ref>
  flow.mjs claim-issue --plan <path> --issue <NN> [--session <id>]
  flow.mjs record-issue --plan <path> --issue <NN> --session <id> (--skill </skill>|--action <action>) --result <result> --evidence <ref>
  flow.mjs block-issue --plan <path> --issue <NN> --session <id> --reason <text> --release-condition <text>
  flow.mjs heartbeat-plan|release-plan|claim-plan --plan <path> --session <id>
  flow.mjs heartbeat-issue|release-issue|resume-issue --plan <path> --issue <NN> --session <id>
  flow.mjs sync-plan --plan <path>
  flow.mjs status [--plan <path>]
`;

const runCli = async () => {
  try {
    const parsed = parseCli(process.argv.slice(2));
    if (["help", "--help", "-h"].includes(parsed.command)) {
      process.stdout.write(usage);
      return;
    }
    const workspace = parsed.options.workspace ?? process.cwd();
    delete parsed.options.workspace;
    const result = await executeFlow({ ...parsed, workspace });
    process.stdout.write(`${JSON.stringify({ success: true, ...result }, null, 2)}\n`);
  } catch (error) {
    console.error(JSON.stringify({ error: error.message, success: false }));
    process.exitCode = 1;
  }
};

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) await runCli();
