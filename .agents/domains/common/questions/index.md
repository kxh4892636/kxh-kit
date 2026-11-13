# Questions

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description |
| --- | --- |
| [001-发布包依赖能写catalog吗](001-发布包依赖能写catalog吗.md) | 发布包的生产依赖字段不能写 catalog:，安装方会报 EUNSUPPORTEDPROTOCOL。 |
| [002-覆盖率门槛在哪跑](002-覆盖率门槛在哪跑.md) | 覆盖率阈值写在各包自己的 vite/vitest 配置里，按目标包执行测试。 |
| [003-commit时文件被自动改写](003-commit时文件被自动改写.md) | 提交钩子会在 commit 前对暂存文件执行 vp check --fix 并重新暂存。 |
| [004-两包校验规则是否同源](004-两包校验规则是否同源.md) | pi-toolkit 与 dsh-toolkit 各带一份 check-domain.mjs，lib 三模块逐字一致；改规则必须两包同改。 |
| [005-跑测试会不会在tmp留目录](005-跑测试会不会在tmp留目录.md) | 判断哪个包的测试外溢临时目录：按前缀统计 /tmp 前后数量；当前只有 apps/music 曾漏，已修，其余包自带清理。 |
