---
id: 4f7ce1de-7704-48ec-8126-03d5915c0858
---

# GORM 与 MySQL

## 数据模型

```go
type ArticleRow struct {
	ID        int64     `gorm:"primaryKey"`
	AuthorID  int64     `gorm:"not null;index"`
	Title     string    `gorm:"size:100;not null"`
	Content   string    `gorm:"type:text;not null"`
	CreatedAt time.Time
	UpdatedAt time.Time
}
```

- Row: 数据库表示; 与 HTTP model、领域 entity 分离;
- 索引: 根据查询和唯一性需求设计，不因字段存在就加索引;
- 时间: 数据库存 UTC，响应层按契约格式化;
- migration: 生产环境使用受审查的版本化迁移，不依赖启动时无条件 AutoMigrate;

## Repository 实现

```go
func (r *GormArticleRepository) FindByID(ctx context.Context, id int64) (*Article, error) {
	var row ArticleRow
	err := r.db.WithContext(ctx).First(&row, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrArticleNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("find article %d: %w", id, err)
	}
	return toEntity(row), nil
}
```

## 连接池

- `SetMaxOpenConns`: 限制并发数据库连接，需与实例数和数据库上限共同计算;
- `SetMaxIdleConns`: 保留可复用空闲连接，减少建连开销;
- `SetConnMaxLifetime`: 小于数据库或代理强制回收周期;
- startup ping: 在 readiness 前验证连接，但不要因短暂故障无限阻塞启动;

## 事务边界

- Service 用例决定事务范围，Repository 提供受控事务执行能力;
- 所有事务调用使用同一个带 context 的 DB handle;
- 不在事务内执行不受控的远程 HTTP 调用;
- 唯一键冲突映射为 409 领域冲突，不把 MySQL 错误文本返回客户端;

## 测试替换

- Service 测试: 使用内存或 fake Repository;
- Repository 测试: 针对真实 MySQL 兼容环境验证 SQL、索引和事务;
- Handler 测试: 不依赖真实数据库，注入可控 Service;
