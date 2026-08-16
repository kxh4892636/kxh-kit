---
id: 6748ce8e-7752-4cd9-9bc5-109f20d6561d
---

# SQL 与 NoSQL

SQL 和 NoSQL 在存储、Schema、查询、扩展、可靠性上如何对比？如何选型？

## 存储

- SQL: 表结构，行代表实体，列代表属性;
- NoSQL: 多种模型，如键值、文档、图;

## Schema

- SQL: 固定 Schema，写入前定义列，变更需迁移;
- NoSQL: 动态 Schema，字段可随时添加;

## 查询

- SQL: 使用标准 SQL，功能强大;
- NoSQL: 面向文档集合，不同数据库语法不同;

## 可扩展性

- SQL: 通常垂直扩展，跨服务器扩展困难;
- NoSQL: 通常水平扩展，可加廉价机器，自动分布数据;

## 可靠性

- SQL: 多数 ACID 兼容，事务安全更可靠;
- NoSQL: 常牺牲 ACID 换取性能与扩展;

## 选型理由

- 选 SQL: 结构化数据、强 Schema、关系数据、复杂 Join、事务、索引查找;
- 选 NoSQL: 动态 Schema、非关系数据、无需复杂 Join、数据密集、高 IOPS;
