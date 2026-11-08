# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-Node服务提供证券目录](001-Node%E6%9C%8D%E5%8A%A1%E6%8F%90%E4%BE%9B%E8%AF%81%E5%88%B8%E7%9B%AE%E5%BD%95.md) | 通过 workspace 启动 Node 服务，可查询两个预置证券及健康状态，无需 Go。 | — |
| [002-日线查询与缓存刷新](002-%E6%97%A5%E7%BA%BF%E6%9F%A5%E8%AF%A2%E4%B8%8E%E7%BC%93%E5%AD%98%E5%88%B7%E6%96%B0.md) | 调用日线 API 获得前复权日线和明确缓存元信息；已有缓存可重复读取，需要更新时从红色火箭刷新。 | 001-Node服务提供证券目录 |
| [003-行情看板迁入与完整回归](003-%E8%A1%8C%E6%83%85%E7%9C%8B%E6%9D%BF%E8%BF%81%E5%85%A5%E4%B8%8E%E5%AE%8C%E6%95%B4%E5%9B%9E%E5%BD%92.md) | 从 kxh-kit 启动完整 ETF 看板，证券切换、K 线、均线与虚拟均线等现有操作可用，后端使用 Node。 | 002-日线查询与缓存刷新 |
