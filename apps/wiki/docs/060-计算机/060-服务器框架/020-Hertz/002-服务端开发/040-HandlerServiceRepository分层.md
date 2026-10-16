---
id: 9477e4ec-ca7a-4297-94bf-799b1c804950
---

# Handler、Service、Repository 分层

## 如何限定各层的依赖方向？

```text
Hertz/IDL → Handler → Service → Repository 接口 ← MySQL 实现
```

- Handler: 绑定输入、读取身份、调用 Service、映射 HTTP 响应;
- Service: 业务规则、授权判断和事务用例; 不导入 Hertz 包;
- Repository: 领域所需的持久化接口; 不暴露 GORM 查询对象;
- main: 创建实现并注入依赖; 业务包不读取全局单例;

## 如何让 Service 依赖存储接口？

```go
type ArticleRepository interface {
	Create(ctx context.Context, article *Article) error
	FindByID(ctx context.Context, id int64) (*Article, error)
}

type ArticleService struct {
	repo ArticleRepository
}

func (s *ArticleService) Get(ctx context.Context, id int64) (*Article, error) {
	if id <= 0 {
		return nil, ErrInvalidArticleID
	}
	return s.repo.FindByID(ctx, id)
}
```

## 如何把 HTTP 输入转换为业务调用？

```go
func (h *ArticleHandler) Get(ctx context.Context, c *app.RequestContext) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		writeError(c, 400, "INVALID_ARGUMENT", "invalid article id")
		return
	}
	article, err := h.service.Get(ctx, id)
	h.writeResult(c, article, err)
}
```
