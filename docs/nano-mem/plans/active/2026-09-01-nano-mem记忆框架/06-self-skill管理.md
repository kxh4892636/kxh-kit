---
status: completed
blocked_by: ["05"]
---

# self skill 管理

## 交付

`nm self skill list|check|install|update|uninstall` 可用：把包内 `skills/nano-mem/` 安装/更新/卸载到目标工作区 `.agents/skills`（默认 target），写命令走全局 `--dry-run` 预演 + prepare→preview→commit 事务（备份/回滚），managed marker `.nano-mem-managed.json` 识别 not_installed/current/outdated/modified，本地修改需 `--force`——与 loopx 同版发布模式一致（ADR-0003 语义）。

## 范围

- `src/self.ts` 与子模块：技能目录读取/哈希（contentHash = 文件树哈希）、marker 读写、安装状态检测、事务化写入（staged/backup/回滚）。
- 命令：`list`（包内技能 + 状态）、`check --name nano-mem`（状态详情）、`install --name|--all`、`update --name`、`uninstall --name|--all`；`--target <root>`（默认 `<cwd>/.agents/skills`）、`--force`；全局 `--dry-run` 只输出 preview。
- version 取自包 package.json（与 CLI 同版）；marker 文件为 `.nano-mem-managed.json`（隔离 `loopx` 的 `.loopx-managed.json`）。
- 单测：哈希稳定、状态判定（not_installed/current/outdated/modified）、事务回滚（中途失败还原）、--force 覆盖本地修改、--dry-run 不改文件系统。
- 补全 README self 章节（与 05 的占位接上）。
- 不做：loopx 包内技能的串扰（marker 已隔离）；发布流与 npm 版本管理。

## 直接依赖

- 05: `skills/nano-mem/SKILL.md` 作为包内受管 skill 文件；消费其文件树（安装内容来源）。

## 验收

- [ ] `nm self skill list` 显示 `nano-mem` 状态为 not_installed；`install --name nano-mem --dry-run` 输出 preview 且 `.agents/skills` 无变化。
- [ ] `install --name nano-mem` 后 `.agents/skills/nano-mem/SKILL.md` 存在且含 `.nano-mem-managed.json`；`check --name nano-mem` 状态 current。
- [ ] 修改安装目录下的 SKILL.md 后 `update/install` 报错拒绝，`--force` 可覆盖；`uninstall` 删除目录与 marker（本地修改时需 --force）。
- [ ] 模拟安装中途失败（如注入异常）后目录还原为原状态（回滚测试）。
- [ ] 包 `files` 含 `skills`（打包后 tarball 内可找到 skill）。

## 上下文

- [spec](../../../docs/nano-mem/plans/active/2026-09-01-nano-mem记忆框架/spec.md) 实施决策「self skill 管理」
- [ADR-0003](../../../docs/nano-mem/adr/0003-skill与cli同版发布并经self命令管理.md)
- `packages/loopx/src/builtins/self/`（skill-store/skill-state/skill-files）与 `packages/loopx/skills/` — 参考实现
- [story US-006](../../../docs/nano-mem/plans/active/2026-09-01-nano-mem记忆框架/story.md)

## 下一步

决策已澄清：/code-delivery

## 交付记录

- 交付物：`src/self.ts` + `src/self/{skill-catalog,skill-files,skill-state,skill-store}.ts`（文件树哈希/四态判定/两段式事务）+ `src/self.spec.ts`（21 测试）+ cli.ts self 分派 + README self 章节；commit `bf17d0e`（A：feat/nano-mem）。
- 验证证据：test 121/121 passed（存量 100 + 21）；覆盖率 95.33/90.04/98.00/96.08（≥80）；`vp check` pass；build 60.84 kB；冒烟（临时 target）：list→not_installed、install --dry-run 无落盘、install 后 marker {name,version,contentHash}+check=current、本地修改后 update 拒绝+--force 覆盖、uninstall --all 无残留。
- 四态：not_installed/current/outdated/modified（contentHash=sha256(path\0content\0) 排序后哈希）；与 loopx 的差异：install/update/uninstall 对 modified 一律拒绝、--force 覆盖（本 issue 验收口径，loopx 仅 update 保护）。
- 修复缺陷：技能根目录 URL 随 bundle 变位 → 改为 src/self.ts 同深度 `../skills/` 解析。
