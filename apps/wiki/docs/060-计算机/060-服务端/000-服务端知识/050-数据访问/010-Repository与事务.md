---
id: 508cf3c2-2afd-4214-a3df-b772bf5886f0
anki: true
---

# Repository 与事务

## Repository 的存储边界划在哪？

- 接口定义在 Service 侧，实现放基础设施层；接口在消费方定义才能用 fake 做单元测试;
- 返回领域对象，不返回数据库游标、ORM 查询对象、连接句柄;
- 所有数据库调用都带请求上下文，取消与超时才能传到驱动;
- 驱动错误翻译成领域错误（不存在、冲突、超时）；不翻译，业务层就要依赖具体 ORM，换实现时全量修改;
- 适用: 所有需要访问数据库或外部存储的服务。

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

```ts
export interface UserRepository {
  findById(ctx: Ctx, id: string): Promise<User | null>;
  update(ctx: Ctx, user: User): Promise<void>;
}

export const rename = (repo: UserRepository) => async (ctx: Ctx, id: string, name: string) => {
  const user = await repo.findById(ctx, id);
  if (!user) throw new NotFoundError("user");
  await repo.update(ctx, { ...user, name });
};
```

## 事务边界怎么划，有哪些硬规则？

```text
Service 用例
  ├─ 开启事务（或 UnitOfWork）
  ├─ 多次 Repository 调用（同一事务）
  ├─ 领域错误映射
  └─ 提交/回滚
```

- 边界在 Service：一个业务用例一个事务，Repository 不擅自开事务；事务通过参数或上下文传递，不用全局变量;
- 事务内不做 RPC、不发消息、不等待用户输入，事务越短越好；失败重试只发生在事务外层，且业务必须幂等。

| 规则               | 原因                       |
| ------------------ | -------------------------- |
| 事务只包数据库操作 | 外部调用会拉长锁持有时间   |
| 一个用例一个事务   | 嵌套事务语义复杂，容易死锁 |
| 事务内不重试       | 重试可能重复写入           |
| 读操作不加事务     | 增加连接与锁开销           |
| 大事务拆批         | 减少锁范围与回滚成本       |

## 事务边界写错会看到什么症状？

| 症状                     | 原因                      |
| ------------------------ | ------------------------- |
| 单测必须启动数据库       | Service 直接依赖 ORM      |
| 事务里调下游，锁等待超时 | 事务范围过大              |
| 换 ORM 要改业务代码      | 领域层判断了驱动错误      |
| 请求取消后 SQL 还在跑    | 没有传上下文              |
| 同一用例两次开事务       | 事务边界散落在 Repository |
