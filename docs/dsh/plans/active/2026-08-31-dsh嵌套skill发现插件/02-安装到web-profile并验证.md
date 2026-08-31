---
status: pending
blocked_by: ["01"]
---

# 安装到 web profile 并验证

## 交付

嵌套 skill 发现插件安装进本机 DSH web profile；运行中的 GUI 中，loop-x 嵌套 skill（如 to-story、quest-with-domain）进入 skill 目录，现有顶层 skill 不受影响。

## 范围

- 执行 `dsh plugin --profile web add file:<工作区包路径>` 安装插件。
- 确认 `dsh.profile.bundles` 更新、patch 生效且 web profile 加载无错误。
- 验证目录出现嵌套 skill（新会话目录、GUI 技能管理页或 `skills/list` RPC）。
- 记录本机 profile 变更与卸载方式（README 或验证说明）。
- 不含 DSH 上游改动、不含 npm 发布。

## 直接依赖

- 01: 插件包实现与构建产物；消费其 `dist/main.mjs` 与 `cordis.patch.yml`。

## 验收

- [ ] `dsh plugin --profile web add file:<packages/dsh-nested-skill>` 成功，profile `package.json` 的 `dsh.profile.bundles` 含该包
- [ ] web profile 加载插件无错误（patchReload live 生效或重启后正常）
- [ ] 新会话目录包含 loop-x 的嵌套 skill（如 to-story、quest-with-domain），且其描述与 SKILL.md frontmatter 一致
- [ ] 现有顶层 skill（loop-x、loop-x-cli、browser-skill）仍在目录
- [ ] `.agents/skills` 下手工添加的深层嵌套在下一轮刷新后可见（可选人工验证）

## 上下文

- [spec](../../spec.md)「工作环境」
- [ADR-0001](../../adr/0001-嵌套skill任意深度发现.md)
- DSH 插件管理文档：`C:\Users\kxh\kxh-awesome\projects\deepseek-harness\apps\cli\reference\README.zh.md`

## 下一步

/code-delivery
