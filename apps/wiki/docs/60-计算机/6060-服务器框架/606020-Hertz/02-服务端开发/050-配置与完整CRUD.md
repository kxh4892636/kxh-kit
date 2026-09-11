---
id: 1a6d854b-72f3-4360-9a63-05140a735cd2
---

# 配置与完整 CRUD

## 如何安排 CRUD 工程目录？

```text
article-api/
├─ cmd/server/main.go
├─ configs/config.yaml
├─ idl/article.thrift
├─ biz/{handler,model,router}/
└─ internal/
   ├─ article/{entity,service,repository}.go
   ├─ platform/config/
   ├─ platform/database/
   └─ platform/observability/
```

## 如何加载并校验配置？

```text
代码安全默认值 < YAML 文件 < 环境变量 < 启动参数
```

- 可提交配置: 监听地址、超时、日志级别和连接池上限;
- 环境配置: 数据库地址、部署环境和观测 exporter 地址;
- Secret: 密码、JWT key 和证书私钥; 不提交到仓库或普通配置文件;
- 启动校验: 缺少必填项、超时非正数或连接池配置冲突时直接失败;

## 如何组织用户与文章用例？

- 注册用户: 校验唯一身份，安全散列密码;
- 登录: 验证凭据并签发短期 Token;
- 创建文章: 从认证身份取得 author_id，不信任 body 中的作者;
- 查询文章: 支持分页和作者过滤;
- 更新/删除: Service 校验文章存在且当前用户有权限;

## 如何规定 CRUD 的响应契约？

| 操作 | 方法   | 路径                   | 关键结果         |
| ---- | ------ | ---------------------- | ---------------- |
| 创建 | POST   | `/api/v1/articles`     | 201 + 资源       |
| 列表 | GET    | `/api/v1/articles`     | 200 + items/page |
| 详情 | GET    | `/api/v1/articles/:id` | 200 或 404       |
| 更新 | PUT    | `/api/v1/articles/:id` | 200、403 或 409  |
| 删除 | DELETE | `/api/v1/articles/:id` | 204 或 404       |

## 如何组装进程依赖？

- 第一步: 加载并校验配置;
- 第二步: 初始化日志、数据库和 Repository;
- 第三步: 创建 Service 与 Handler;
- 第四步: 注册 recovery、request_id、日志、认证和路由;
- 第五步: 启动健康检查与 HTTP Server;

## 需要核对具体用法时查哪里？

- 官方入口: [hz 生成代码的结构](https://github.com/cloudwego/cloudwego.github.io/blob/38744fc12990bb900765d0235c171a80c9fa2af9/content/zh/docs/hertz/tutorials/toolkit/layout.md)、[配置说明](https://github.com/cloudwego/cloudwego.github.io/blob/38744fc12990bb900765d0235c171a80c9fa2af9/content/zh/docs/hertz/reference/config.md);
- 应用约定: 分层、业务码、数据模型、配置优先级和交付清单是笔记的开发示例，按项目调整；框架 API 以对应官方版本为准;
