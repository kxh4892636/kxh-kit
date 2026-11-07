/**
 * 真机代码路径自检：不起 TUI，用 pi 自己的 SDK 建一个 in-memory 会话，走
 * `/reload` 与 `before_agent_start` 在宿主里的真实实现，验证「关掉 Orchestrator
 * 模式后宿主工具（`read` / `bash` / `edit` / `write`）回来」。
 *
 * 为什么需要它：工具面收敛后，唯一能证明「关模式真的把 `bash` 还回来」的地方是
 * 宿主的运行时 —— 单测里的假 pi 无法覆盖 `session.reload()`、`/reload` 的
 * `session_start` 重放、以及 transcript 里的工具装载重现。
 *
 * 断言：
 * 1. 已收敛的会话 + 模式关 → 下一次 `before_agent_start` 之前把宿主工具装回来；
 * 2. 已收敛的会话 + 模式关 + `reload()` → 宿主工具在活跃集里。
 *
 * 用法（需要 pi 的模型凭据，扩展从 `settings.json` 的 packages 加载）：
 *
 * ```bash
 * cd packages/pi-toolkit
 * node scripts/reload-check.mjs [工作区目录]
 * ```
 *
 * 局限：用 in-memory session，不覆盖 TUI 的按键与面板；`_prepareRun` 是宿主的
 * 内部方法，宿主升级改了它的签名就要跟着改。
 */
import { createAgentSession, getAgentDir, SessionManager } from "@earendil-works/pi-coding-agent";

const cwd = process.argv[2] ?? process.cwd();
const HOST_TOOLS = ["read", "bash", "edit", "write"];
const CONVERGED = [
  "orchestrator_read",
  "orchestrator_write",
  "orchestrator_check",
  "orchestrator_dispatch",
  "orchestrator_workers",
  "ask_questions",
];

const noop = () => undefined;
const failures = [];
const check = (name, ok, detail) => {
  if (!ok) failures.push(name);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` · ${detail}`}`);
};
const hasHostTools = (session) => {
  const active = session.getActiveToolNames();
  return HOST_TOOLS.every((name) => active.includes(name));
};
const describe = (session) => JSON.stringify(session.getActiveToolNames());

const { session, extensionsResult } = await createAgentSession({
  cwd,
  agentDir: getAgentDir(),
  sessionManager: SessionManager.inMemory(cwd),
});
for (const failure of extensionsResult.errors) {
  console.log(`扩展加载失败: ${failure.path}: ${failure.error}`);
}
await session.bindExtensions({
  uiContext: new Proxy({}, { get: () => noop }),
  mode: "tui",
});
console.log(`agentDir: ${getAgentDir()} · cwd: ${cwd}`);
console.log(`启动活跃集: ${describe(session)}`);

/** 模式开 → 收敛；再记一条模式关，但**不**手动 sync，让钩子自己去对齐。 */
const convergeThenTurnOff = () => {
  session.sessionManager.appendCustomEntry("orchestrator-mode", { enabled: true });
  session.setActiveToolsByName(CONVERGED);
  session.sessionManager.appendCustomEntry("orchestrator-mode", { enabled: false });
};

convergeThenTurnOff();
check("收敛后只剩本插件的工具", describe(session) === JSON.stringify(CONVERGED), describe(session));

await session._prepareRun({ messageType: "user", prompt: "reload-check" });
check("模式关 → before_agent_start 恢复宿主工具", hasHostTools(session), describe(session));

convergeThenTurnOff();
await session.reload({});
check("模式关 → reload 恢复宿主工具", hasHostTools(session), describe(session));

process.exitCode = failures.length === 0 ? 0 : 1;
console.log(failures.length === 0 ? "全部通过" : `${failures.length} 条失败`);
