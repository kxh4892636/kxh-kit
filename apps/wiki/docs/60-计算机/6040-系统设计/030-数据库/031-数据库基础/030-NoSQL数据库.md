---
id: 0436ab65-6d15-4cfa-8acb-ea47042d52ed
---

# NoSQL 数据库

NoSQL 有哪些类型？各自适用场景和优缺点是什么？

## 定义

- NoSQL: 不使用 SQL 作为主要数据访问语言的数据库总称;
- 特点: 通常无预定义 Schema，遵循 BASE;

## Document 文档数据库

- 存储: 文档（如 JSON）;
- 优点: 直观灵活、易水平扩展、Schemaless;
- 缺点: Schemaless、非关系;
- 示例: MongoDB、CouchDB;

## Key-value 键值数据库

- 存储: 键值对;
- 优点: 简单高性能、高扩展、适合会话管理、查找优化;
- 缺点: CRUD 基础、值不可过滤、缺少索引/扫描、不适合复杂查询;
- 示例: Redis、Memcached、DynamoDB;

## Graph 图数据库

- 存储: 节点、边、属性;
- 优点: 关系查询快、灵活、显式表达数据关系;
- 缺点: 复杂、无标准查询语言;
- 用例: 欺诈检测、推荐、社交网络、网络映射;
- 示例: Neo4j、ArangoDB、Neptune;

## Time series 时序数据库

- 存储: 时间戳数据;
- 优点: 快速插入与检索、存储高效;
- 用例: IoT、指标分析、应用监控、金融趋势;
- 示例: InfluxDB、Druid;

## Wide column 宽列数据库

- 存储: 列族而非行和列;
- 优点: 可扩展至 PB 级、适合实时大数据;
- 缺点: 昂贵、写时间增加;
- 用例: 业务分析、属性型数据;
- 示例: BigTable、Cassandra、ScyllaDB;

## Multi-model 多模型数据库

- 存储: 在一个后端组合多种模型（关系、图、键值、文档等）;
- 优点: 灵活、适合复杂项目、数据一致;
- 缺点: 复杂、成熟度较低;
- 示例: ArangoDB、Cosmos DB、Couchbase;
