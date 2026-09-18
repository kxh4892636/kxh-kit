---
id: 7bd9043b-cd5e-408b-86e8-d882d69c44ce
---

# 单元测试与 HTTP 集成测试

## 如何划分接口测试层次？

- Service 单测: fake Repository; 验证业务规则、权限和错误分类;
- Handler 单测: fake Service; 验证绑定、状态码和响应结构;
- HTTP 集成测试: 启动完整路由与中间件，发出真实协议请求;
- Repository 测试: 真实 MySQL 兼容环境; 验证 SQL、迁移和事务;
- 外部 Client 测试: stub Server; 验证 timeout、重试和响应解析;

## 如何验证越权操作没有副作用？

```go
func TestDeleteRejectsNonOwner(t *testing.T) {
	repo := &fakeRepo{article: &Article{ID: 7, AuthorID: 10}}
	svc := NewArticleService(repo)

	err := svc.Delete(context.Background(), 20, 7)
	if !errors.Is(err, ErrPermissionDenied) {
		t.Fatalf("want permission denied, got %v", err)
	}
}
```

## 如何断言 Handler 的协议结果？

- 状态码: 400、401、403、404、409 和 500 映射正确;
- Content-Type: JSON 接口返回正确媒体类型;
- schema: code、message、request_id 字段存在;
- 副作用: 校验失败或未认证时 Service 没有被调用;
- 安全: 内部错误、Token 和堆栈不出现在 body;

## 如何验证完整接口链路？

```text
注册 → 登录 → 创建文章 → 列表查询 → 更新 → 删除 → 再查返回 404
```

- 实践: 每个测试构造独立 Engine，避免全局路由互相污染;
- 实践: 固定时钟、ID 生成器和随机源，避免脆弱断言;
- 实践: 并发运行时不共享可变 fake;
- 实践: 测试结束关闭 Server、连接和 exporter;

## 如何执行交付检查？

```powershell
go test ./...
go test -race ./...
go vet ./...
go build ./...
```

- race: 覆盖自定义中间件、缓存和后台任务;
- 最小冒烟: 启动二进制，等待 readiness，调用关键 API，再优雅退出;
- 失败测试: 先证明能捕获缺陷，再修改实现;

## 需要核对具体用法时查哪里？

- 官方入口: [单测](https://github.com/cloudwego/cloudwego.github.io/blob/38744fc12990bb900765d0235c171a80c9fa2af9/content/zh/docs/hertz/tutorials/basic-feature/unit-test.md);
- 应用约定: 分层、业务码、数据模型、配置优先级和交付清单是笔记的开发示例，按项目调整；框架 API 以对应官方版本为准;
