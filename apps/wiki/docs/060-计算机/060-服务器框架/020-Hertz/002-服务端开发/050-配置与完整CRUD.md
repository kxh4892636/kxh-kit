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

## 如何组装进程依赖？

- 第一步: 加载并校验配置;
- 第二步: 初始化日志、数据库和 Repository;
- 第三步: 创建 Service 与 Handler;
- 第四步: 注册 recovery、request_id、日志、认证和路由;
- 第五步: 启动健康检查与 HTTP Server;
