# Questions

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description |
| --- | --- |
| [001-Plan迁生命周期后log残留旧目录](001-Plan迁生命周期后log残留旧目录.md) | Plan 迁生命周期目录时若先建目标目录再逐文件搬，被 gitignore 的 log.jsonl 会留在旧路径，check 把它当 Plan 并报 spec.md 缺失。 |
| [002-overlay格子一律回落到终端默认底色](002-overlay格子一律回落到终端默认底色.md) | pi-tui 合成 overlay 时强制 SGR reset，overlay 的每个格子都拿不到底行背景：铺空格会抹出黑带，单格图标也是默认底色（当前 pi-tui 无透明合成）。 |
