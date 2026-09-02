---
status: completed
blocked_by: []
---

# 建立 Pi package 与全局配置契约

## 交付

仓库中出现可由 Pi 识别和加载的 `pi-deepseek-web` package，并能从 Pi 用户目录严格解析一次调用所需的 search/fetch 配置，不读取或持久化真实 credential。

## 范围

创建 `packages/pi-deepseek-web` manifest、extension entry、构建/检查/测试脚本、无 secret 示例配置和 README 基线；实现 `getAgentDir()/pi-deepseek-web.json` 路径解析、strict JSON schema、默认值、credential precedence 与每次调用 snapshot。建立可注入文件/环境读取的测试 seam。暂不发送网络请求、不创建用户实际配置、不注册完成版 web 工具。

## 直接依赖

- 无。

## 验收

- [x] Pi package manifest 能定位真实 TypeScript extension entry；focused tests 证明配置缺失/非法/未知字段、默认值、literal/env precedence、跨调用 reload 与单调用 snapshot，且 sentinel secret 不进入可观察错误或结果。

## 上下文

- [spec](spec.md)
- [Pi 领域语言](../../../CONTEXT.md)
- [全局配置 ADR](../../../adr/0002-插件采用全局分区配置.md)
- [Pi packages 参考](../../../../../.temp/pi/packages/coding-agent/docs/packages.md)

## 下一步

/code-delivery

## 阻塞记录

仅 status 为 blocked 时保留。

## 交付记录

- 交付物：`packages/pi-deepseek-web` Pi package manifest、TypeScript extension entry、全局配置加载器、无 secret 示例配置与 README。
- 验证证据：`pnpm --filter @kxh4892636/pi-deepseek-web check`、17 个 focused tests、四项覆盖率均高于 80%、`pnpm --filter @kxh4892636/pi-deepseek-web build` 与 `git diff --check` 通过。
- 审查：Spec 轴通过；Standards 轴无阻断项，保留一项低风险显式字段契约重复取舍。
