---
id: f9dcfa17-ee91-4b69-a923-f993cf9c5ea2
---

# WebDAV 扩展协议

## WebDAV 是什么？

- WebDAV: 基于 HTTP/1.1 扩展的分布式文件系统协议;
- 目的: 让客户端直接操作服务器上的内容, 包括属性、集合与锁;

## WebDAV 新增了哪些方法？

| 方法        | 描述           |
| ----------- | -------------- |
| `PROPFIND`  | 获取属性       |
| `PROPPATCH` | 修改属性       |
| `MKCOL`     | 创建集合       |
| `COPY`      | 复制资源及属性 |
| `MOVE`      | 移动资源       |
| `LOCK`      | 资源加锁       |
| `UNLOCK`    | 资源解锁       |

## WebDAV 新增了哪些状态码？

| 状态码 | 描述                                              |
| ------ | ------------------------------------------------- |
| 102    | Processing, 可正常处理但目前处于处理中状态        |
| 207    | Multi-Status, 存在多种状态                        |
| 422    | Unprocessable Entity, 格式正确但内容有误          |
| 423    | Locked, 资源已被加锁                              |
| 424    | Failed Dependency, 关联请求失败, 依赖关系不再维持 |
| 507    | Insufficient Storage, 保存空间不足                |
