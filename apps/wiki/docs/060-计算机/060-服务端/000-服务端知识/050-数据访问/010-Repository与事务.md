---
id: 508cf3c2-2afd-4214-a3df-b772bf5886f0
anki: true
---

# Repository 与事务

## Repository 的存储边界划在哪？

- 接口定义在 Service 侧，实现放基础设施层；接口在消费方定义才能用 fake 做单元测试;
- 返回领域对象，不返回具体数据库游标、ORM 查询对象、连接句柄;

## Repository 接口与实现长什么样？

```go
type UserRepository interface {
	FindByID(ctx context.Context, id int64) (*User, error)
	Create(ctx context.Context, u *User) error
}

type UserService struct{ repo UserRepository }

func (s *UserService) Rename(ctx context.Context, id int64, name string) error {
	u, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return err // 领域错误已由 Repository 翻译
	}
	u.Name = name
	return s.repo.Update(ctx, u)
}
```

## 事务边界怎么划，有哪些硬规则？

- 边界在 Service：一个业务用例一个事务，Repository 不擅自开事务;
- 事务内不做 RPC、不发消息、不等待用户输入，事务越短越好；失败重试只发生在事务外层，且业务必须幂等。

```text
Service 用例
  ├─ 开启事务（或 UnitOfWork）
  ├─ 多次 Repository 调用（同一事务）
  ├─ 领域错误映射
  └─ 提交/回滚
```
