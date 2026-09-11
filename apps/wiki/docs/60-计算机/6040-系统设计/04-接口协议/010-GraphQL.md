---
id: 69fc49a5-9474-4a49-b913-e23394be9e87
---

# GraphQL

## GraphQL 如何只返回客户端请求的字段？

- GraphQL: 用类型模式描述接口，由客户端选择字段和参数，服务端 resolver 负责解析并取数据;
- 操作: query 用于读取，mutation 用于修改，字段选择不意味着能绕过服务端授权;
- 收益: 多个关联字段可以在一次请求中获取，减少过量数据并支持类型检查与代码生成;
- 代价: 查询复杂度、缓存与字段演进由服务端治理，逐字段解析还可能产生 N+1，处理见 [SQL 查询优化](../02-存储与建模/030-SQL查询.md);

```graphql
query {
  user(id: "u1") {
    id
    name
  }
}
```

- 示例含义: 客户端只请求用户标识与名字，服务端仍负责按模式、权限和数据源生成结果;

## Schema 与 resolver 怎样共同完成一次查询？

```graphql
type User {
  id: ID!
  name: String!
}
type Query {
  user(id: ID!): User
}
```

- Schema: 约定有哪些类型、字段和参数，客户端可以据此发现接口并生成代码;
- Resolver: 对 user 等字段执行数据读取，结果必须符合模式，但查询语言不会自动替代底层数据库优化;
- 复杂度控制: 客户端可以自由组合字段，服务端仍应限制深度、数量和昂贵查询，避免一次请求占用无限资源;
- 演进: 增加字段通常较容易保持旧查询兼容，删除或改变字段类型需要明确弃用和迁移过程;

## 本篇依据哪些材料？

- 来源: Karan Pratap Singh 的 System Design，[原文 L2719–L2811](https://github.com/karanpratapsingh/system-design/blob/b150e62ef30c1343cffbe83f4df60d14ab1d234f/README.md#L2719-L2811)；本篇按概念重组，修正和补充已在相关段落注明;
