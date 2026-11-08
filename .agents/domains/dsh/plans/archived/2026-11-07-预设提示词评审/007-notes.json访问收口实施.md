---
name: '007-notes.json访问收口实施'
description: '用 tools.guard 与 ctx.fs 包装，拒绝非 nano_flow_* 工具对 Plan notes.json 的显式读写。'
status: completed
reason: ''
related_noted:
  - '006-notes.json的访问收口'
next_step: ''
---

# 007-notes.json访问收口实施

> 迁移自旧 notes.json / story.md / spec.md；正文保留历史记录，旧工具、状态名与路径不再适用。

## 目标

- 非 `nano_flow_*` 工具不能读写 Plan 下的 `notes.json`：fs 工具按已解析 target 拒绝，其它工具按参数里的显式引用拒绝。
- 保留 shell / jobs / subagent / fs-search；README 与 QUESTIONS 写明它们仍可绕过，这是策略而非安全边界。

## 实现

1. `src/host/notes-guard.ts`
   - `notesToolGuard(exec)`：`exec.name` 以 `nano_flow_` 开头放行；从 args 取路径类字段（`file_path` / `path` / `target`），命中 Plan 的 `notes.json` 时返回拒绝原因；`command` / `script` 按字面路径正则搜。
   - `installFsNotesGuard(fs)`：包装 `readText` / `streamText` / `readBytes` / `readByteRange` / `writeText` / `editText`；target 的进程路径（`processPath`，退回 `displayPath`）落在 `plans/<lifecycle>/<name>/notes.json` 时拒绝；返回还原 disposer。
2. 根插件挂载：`ctx.inject(["tools", "fs"])` 一次装两道闸门，`child.effect` 清理；预设半（`config.nanoFlowOnly`）不重复安装。
3. `README.md` 与 `docs/dsh/QUESTIONS.md` 记录边界（shell/子进程/第三方插件可绕过）。
4. 测试：guard（read/pwsh 命中、grep `pattern` 与 write `content` 不误伤、`notes.json.bak` 不误伤、Plan 目录作搜索根放行）；fs 包装（六个方法被拒、其它文件放行、disposer 还原、后装覆盖保护、tools 缺席告警）。

## 验收

- 在 Nano Flow 会话里 `read` 读 Plan 的 `notes.json` 被拒；读其它文件正常；`nano_flow_read` / `nano_flow_write` 正常；`pwsh` 字面命令被拒（策略）。
- 测试、构建、安装通过；README/QUESTIONS 写明不是安全边界。

## 执行检查点（2026-11-07）

- 与设计稿的差异：删掉 `pattern` / `glob` / `prompt` 三个扫描键。`grep` 的 `pattern` 是正则（搜代码里的 `notes.json` 必须放行）；`glob` 只列目录不读内容；`subagent` 的 `prompt` 由子 agent 自己的工具调用兜住（全局 guard 与 fs 包装对子 agent 同样生效），扫它只会挡住「让子 agent 去改这个 guard」这类正常任务。
- 路径键收敛为 `file_path` / `path` / `target`：路径按整段匹配，命令（`command` / `script`）按字面路径正则搜，后向边界挡掉 `notes.json.bak`。
- `ctx.fs` 包装补上 `readByteRange`（内容读，原设计漏了）；六个方法都按 Promise 契约 reject；target 路径优先取后端 `processPath`，不提供时退回 `displayPath`。
- 验证：`notes-guard.test` 12 项 + 入口用例；全套 237 测试通过；`vp check` 通过；`build` 成功。
- 文档：README 的收口小节与验证第 7 条；`docs/dsh/QUESTIONS.md` 一条问答。README 的轮转段落同时改成现行口径（用户排队消息时判断，note 08 的实现），此前它仍写着「每轮 turn/end 后读压力」。

## 真机验收（2026-11-07 03:3x，重启后）

- `read` Plan 的 `notes.json` → `Error: notes.json 只能经 nano_flow_read / nano_flow_write 读写：read 的参数引用了 Plan 的 notes.json`
- `pwsh` 里 `Get-Content ...\notes.json` → 同样被拒（命令里的字面路径，策略级）
- `grep` 搜 `notes.json`（`store.ts`）→ 正常命中，未误伤
- `nano_flow_read` / `nano_flow_write` 正常：本 note 的验收与完成就是用它写的
- 挂载诊断 `$DSH_HOME/toolkit/nano-flow-mount.json`：stages = `entry`(via preset) / `apply` / `ready`（13,041 B）/ `rotation` 四项齐全
- 未单独复验：标准预设会话（根插件全局安装，逻辑上同样生效）；用编码路径绕过的旁路按设计存在

## 不做

- 不移除 shell / jobs / subagent / fs-search。
- 不做 OS ACL、独立写入身份或加密存储。

## 迁移前的证据
- `src/host/notes-guard.ts`：`isPlanNotesPath`（`plans` 段 + `notes.json` 末段，分隔符与大小写归一）、`notesToolGuard`（`nano_flow_*` 放行；`file_path`/`path`/`target` 整段判定；`command`/`script` 按字面路径正则）、`installFsNotesGuard`（包装 readText/streamText/readBytes/readByteRange/writeText/editText）、`installNotesGuard`（装配两道闸门）
- `src/index.ts`：根插件 `ctx.inject(["tools", "fs"])` 挂 `installNotesGuard`，`child.effect` 卸载；预设半（`config.nanoFlowOnly`）不重复安装
- `src/host/notes-guard.test.ts` 12 项：路径判定、工具闸门（grep `pattern` 与 write `content` 不误伤、`notes.json.bak` 不误伤、Plan 目录作搜索根放行）、六个 fs 方法的拒绝与还原、后装覆盖保护、tools 缺席 / 无 `guard()` 的告警
- `src/index.test.ts` 新增入口安装/卸载用例；`vp test run src`：29 文件 / 237 tests 通过（原 224）
- `vp check --fix` 通过（84 文件）；`pnpm build` 成功，dist/nano-flow 资产重写
- 文档：README 新增「notes.json 的访问收口（策略级）」与验证第 7 条；`docs/dsh/QUESTIONS.md` 新增「为什么 read 读不到 Plan 的 notes.json」
- 已装包：`kxh4892636-dsh-toolkit-0.4.1.tgz` 重打包后 remove + add 到 desktop profile；安装目录 `dist/index.mjs` SHA-256 651E5527…F483A、`dist/nano-flow/prompt.md` 13B2D7D3…5A57E，均与仓库 dist 一致；已提交 0a3d5f79
- 待重启宿主验证：Nano Flow 会话里 `read` Plan 的 `notes.json` 应被拒、`nano_flow_*` 正常；本会话没有 `nano_flow_*` 工具，故这次的 Plan 变更仍是直接改文件（见 spec 开放问题）
- `src/host/notes-guard.ts`：`isPlanNotesPath`（`plans` 段 + `notes.json` 末段，分隔符与大小写归一）、`notesToolGuard`（`nano_flow_*` 放行；`file_path`/`path`/`target` 整段判定；`command`/`script` 按字面路径正则）、`installFsNotesGuard`（包装 readText/streamText/readBytes/readByteRange/writeText/editText，按已解析 target 判定）、`installNotesGuard`（装配两道闸门）
- `src/index.ts`：根插件 `ctx.inject(["tools", "fs"])` 挂 `installNotesGuard`，`child.effect` 卸载；预设半（`config.nanoFlowOnly`）不重复安装
- `src/host/notes-guard.test.ts` 12 项 + `src/index.test.ts` 入口安装/卸载用例；`vp test run src`：29 文件 / 241 tests 通过
- `vp check --fix` 通过（85 文件）；`pnpm build` 成功；`nano_flow_check workspace` 通过
- 真机（2026-11-07 03:3x 重启后）：`read` Plan 的 `notes.json` 返回「notes.json 只能经 nano_flow_read / nano_flow_write 读写」，`pwsh` 的字面路径命令同样被拒，`grep` 搜 `notes.json` 与读其它文件不受影响，`nano_flow_read`/`nano_flow_write` 正常
- 挂载诊断 `$DSH_HOME/toolkit/nano-flow-mount.json`：stages = entry(via preset) / apply / ready(13,041 B) / rotation 四项齐全
- 文档：README「notes.json 的访问收口（策略级）」+ 验证第 7/8 条；`docs/dsh/QUESTIONS.md` 新增「为什么 read 读不到 Plan 的 notes.json」
- 已装包并提交：`kxh4892636-dsh-toolkit-0.4.1.tgz` 装入 desktop profile，`dist/index.mjs` 与仓库 dist 同哈希；0a3d5f79 落地实现、2865f06c 恢复预设半
