---
status: completed
blocked_by: ["02"]
---

# 屏蔽 dsh 自带 office 技能

## 交付

`@kxh4892636/dsh-toolkit` 新增工具 `office-skills`（「移除 dsh 自带 office 技能」，默认关闭）。开启后
宿主内置的 `office`、`office-docx`、`office-pptx`、`office-xlsx`、`office-render`、
`office-recalculate`、`office-export-pdf` 从技能目录与 `skill` 加载入口同时消失；关闭即恢复。

## 范围

- `src/host/skill-mask.ts`：`installSkillMask` + 判据 `isDshOfficeSkill`。
- `src/host/tools/office-skills.ts`：工具声明。
- `src/contract.ts` / `src/index.ts`：`office-skills` 工具 id 与注册。
- 测试：`src/host/skill-mask.test.ts`、`src/host/tools/tools.test.ts`、`src/index.test.ts`。
- README/CONTEXT 同步；版本 `0.3.0`。

不做：不注销 provider、不删宿主安装目录里的 skill 资产、不改上游 DSH。

## 直接依赖

- 02：工具注册表与开关状态（`ToolkitTool { id, title, description, defaultEnabled, apply }`）。

## 验收

- [x] 开关打开后 `ctx.skills.snapshot()` / `list()` 里没有 office 技能，`get("office-docx")` 返回 `undefined`。
- [x] 开关关闭后三个入口还原，office 技能回到目录；状态落盘到 `$DSH_HOME/toolkit/state.json`。
- [x] 用户自己的 `office-*`（`user-dsh` / `project-dsh` 来源）不被屏蔽。
- [x] `vp test src` 142 passed；`vp check` 0 error 0 warning；覆盖率 `skill-mask.ts` 100%。

## 决策与证据

- **取证（2026-11-05）**：桌面宿主的 office 技能由 `dsh-desktop-host/lib/index.js:331-335` 在 profile 启动后
  以代码 `ctx.plugin(office_exports, …)` 挂载，`apply` 内再 `ctx.plugin(officeSkills, { assetRoot: <runtime>/office-skills })`；
  provider 名 `dsh-office`、`source: bundled`、`rank: BUNDLED_SKILL_RANK(600)`，注册进**全局层**
  （`dsh-skill-office/lib/index.js:58-101`）。它不在 `~/.dsh/profiles/desktop` 的 `cordis.yml` / `cordis.patch.yml` 里，
  profile 层没有可 `disabled` 的行。
- **排除「启动时删/改技能资产」**：注册时对 `SKILL.md` 做 `readFileSync`，缺文件会让宿主启动失败；改文件则升级即失效。
- **排除「同名占位 shadow」**：本插件的 row 与 desktop-office 都落在全局层，同名候选只会触发
  「higher-priority skill already exists」告警并按 rank/注册序二选一，屏蔽语义取决于加载顺序。
- **采用「读取面过滤」**：只包装 `ctx.skills` 的三个公开读取入口，provider 仍注册（目录缓存与 complete 语义不变），
  开关切换无需重注册；`skill` 工具、`/skill` 命令、技能页面一次性生效。
- **判据两段**：`provider === "dsh-office"` 精确命中；`bundled` 来源的 `office` / `office-*` 兜底 provider 改名，
  但不会误伤用户来源的同名 skill。
- **还原安全**：disposer 只在方法仍等于本次安装的包装器时还原（原先的自有属性写回原函数，原型方法则删掉自有属性）。

## 执行检查点

- 2026-11-05：实现 `skill-mask.ts` / `office-skills.ts` 并接入注册表；单测 7 个（判据 2、屏蔽 4、降级 1）。
- `vp check` 首轮报 unbound-method 警告 → 改为 `Reflect.get` 取原方法、测试改为行为断言；复跑 0 error 0 warning。
- 打包：`vp pack` + `wrap-client`（`dist/index.mjs` 48.78 kB、`dist/client.js` 24.4 kB）。

## 下一步

重新打包并装进 desktop profile（`0.3.0`），重启宿主后按 README「验证」第 3 步确认 office 技能消失/恢复。

## 交付记录

- 交付物：`packages/dsh-toolkit` 的 `office-skills` 工具。
- 验证：`vp test src` 142 passed；`vp check` 0/0；覆盖率 `skill-mask.ts`、`office-skills.ts` 均 100%。
- 遗留：GUI 重启验收（需用户重启宿主）。
