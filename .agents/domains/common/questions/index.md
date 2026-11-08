# Questions

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description |
| --- | --- |
| [001-发布包依赖能写catalog吗](001-%E5%8F%91%E5%B8%83%E5%8C%85%E4%BE%9D%E8%B5%96%E8%83%BD%E5%86%99catalog%E5%90%97.md) | 发布包的生产依赖字段不能写 catalog:，安装方会报 EUNSUPPORTEDPROTOCOL。 |
| [002-覆盖率门槛在哪跑](002-%E8%A6%86%E7%9B%96%E7%8E%87%E9%97%A8%E6%A7%9B%E5%9C%A8%E5%93%AA%E8%B7%91.md) | 覆盖率阈值写在各包自己的 vite/vitest 配置里，按目标包执行测试。 |
| [003-commit时文件被自动改写](003-commit%E6%97%B6%E6%96%87%E4%BB%B6%E8%A2%AB%E8%87%AA%E5%8A%A8%E6%94%B9%E5%86%99.md) | 提交钩子会在 commit 前对暂存文件执行 vp check --fix 并重新暂存。 |
