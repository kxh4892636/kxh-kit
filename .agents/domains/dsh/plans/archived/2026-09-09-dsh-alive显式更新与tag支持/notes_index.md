# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-版本准备按tag参数化](001-%E7%89%88%E6%9C%AC%E5%87%86%E5%A4%87%E6%8C%89tag%E5%8F%82%E6%95%B0%E5%8C%96.md) | 版本准备接受发布标签参数，并按 `@deepseek-ai/dsh@<tag>` 解析精确版本；现有自动更新行为保持不变。 | — |
| [002-移除自动更新与显式update命令](002-%E7%A7%BB%E9%99%A4%E8%87%AA%E5%8A%A8%E6%9B%B4%E6%96%B0%E4%B8%8E%E6%98%BE%E5%BC%8Fupdate%E5%91%BD%E4%BB%A4.md) | `dsh-alive` 不再后台自动更新：`start` 每次检查当前通道版本并按需更新后启动；新增 `update` 只准备版本、不启动也不重启；`--tag` 支持 `latest`、`alpha`、`next` 等标签并按端口记忆；`status` 显示当前通道与已就绪未生效的版本 | 001-版本准备按tag参数化 |
| [003-真实通道切换冒烟与文档同步](003-%E7%9C%9F%E5%AE%9E%E9%80%9A%E9%81%93%E5%88%87%E6%8D%A2%E5%86%92%E7%83%9F%E4%B8%8E%E6%96%87%E6%A1%A3%E5%90%8C%E6%AD%A5.md) | 真实 npm 通道切换的可复核证据，以及领域语言同步：`update` 只准备版本、`start` 才切换运行版本的行为在真实包上被验证。 | 002-移除自动更新与显式update命令 |
