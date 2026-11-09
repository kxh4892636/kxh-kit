---
name: '001-安装pi-toolkit并真机验收'
description: '改动 packages/pi-toolkit 后要装进本机 pi 时：先 check/test，再 pi install，重启或 /reload 后才生效，随后按本次改动做一项真机观察。'
---

# 001-安装pi-toolkit并真机验收

## 触发条件

改了 `packages/pi-toolkit`（含 `src/nano-flow` 的提示词、skill、模板与校验脚本），要让本机 pi 真正用上新行为时。

## 步骤

1. **静态门禁**：`pnpm --filter @kxh4892636/pi-toolkit check`（格式 + lint + 类型）。
2. **单测**：`pnpm --filter @kxh4892636/pi-toolkit test`；只改 nano-flow 时可先跑该目录快跑。
3. **安装**：`pi install /absolute/path/to/packages/pi-toolkit`（README 口径）。仓库内也用过相对路径加 `-a`：`pi install ./packages/pi-toolkit -a`，安装后 `~/.pi/agent/settings.json` 指向该包。pi 用 jiti 直接加载 TS，**不需要 build**。
4. **生效**：扩展与 nested-skill 发现都在 pi 启动或 `/reload` 时发生，固定提示词在 run 开始时注入 —— 改完必须**重启 pi 或新开会话**才可信；未重启时看到的是旧行为，别当证据。
5. **真机验收**（按本次改动挑一项，把观察结果写进 note）：
   - 开关：`/toolkit` 五行的开启/关闭立即生效（`webTools` / `askQuestions` 即时，`nestedSkills` 要等下一次 `input` 或 `/reload`）。
   - Nano Flow：`/toolkit` 开 `nanoFlow` → `/nano-flow` 开本会话 → `nano_flow_bind` 绑 Plan → 跑一轮带工具调用的问答 → `<plan>/log.jsonl` 出现一条 `type: "run"`（`run: 1`，`entries` 含本轮 user / assistant / toolResult）→ 再跑一轮确认 `run: 2` 只含新增条目 → 侧栏在 `turn_end` 出现未完成 note。
   - 上下文清空：临时调小 `nanoFlow.rotateAt` 后跑一轮，出现 `nano-flow-reset` 条目且历史被过滤，会话不被替换。
   - `web_search` / `web_fetch`：在开关打开且 `DEEPSEEK_API_KEY` 可读时各调一次。
6. **核对不产生副作用**：`git status` 不应出现 `log.jsonl`（根 `.gitignore` 的 `**/plans/**/log.jsonl`）；配置只在 `pi-toolkit.json` 一处变化。

## 已知坑

- **中途打开 Nano Flow 拿不到随包 skill**：skill 经 `resources_discover` 注入，`/nano-flow on` 之后需要 `/reload` 或新会话才出现；命令提示里已写明这一点。
- **headless 冒烟会污染 Plan 轨迹**：在仓库内用 headless 会话冒烟时，若该会话绑定过真实 Plan，`agent_end` 会把测试记录写进那个 Plan 的 `log.jsonl`。冒烟用 `/tmp` 下造的会话文件，事后按 `id` 去重并重编号，别留下测试 run。
- **改提示词后先看 `dist` 不适用**：pi 不做构建，检查安装副本要看 `~/.pi/agent/settings.json` 指向的包路径与源文件，而不是 `dist`。
- 旧会话仍挂着旧的扩展实例与旧提示词；验收必须用重启后的新会话。典型症状：`nano_flow_check` 报 `Cannot read properties of undefined (reading 'length')` 这类底层 TypeError，而同一份代码在新进程里跑通 —— 那是工具与 `scripts/check-domain.mjs` 模块版本错配，`/reload` 或重启后重试；工具本身会先报出「缺少某个字段…重启 pi 或 /reload」。

## 相关

- [005-plan轨迹用会话条目副本按run落盘](../../adr/005-plan轨迹用会话条目副本按run落盘.md) — 验收第 5 步要核对的 `log.jsonl` 形态与写入时机。
- [004-dream由命令手动触发且不依赖seq游标](../../adr/004-dream由命令手动触发且不依赖seq游标.md) — 改 dream 指令后同样要重启并在干净工作区跑一次 `/dream`。
