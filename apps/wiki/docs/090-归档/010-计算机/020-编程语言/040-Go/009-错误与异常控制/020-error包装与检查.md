---
id: 71ae5a8c-caf0-4cb7-93c7-e81b53347b7a
---

# error 包装与检查

## 如何包装错误？ fmt.Errorf 与 %w 有何作用？

- `fmt.Errorf`: 格式化并创建错误;
- `%w`: 包装原始错误并保留错误链;

```go
import "fmt"

func load() error {
	if err := read(); err != nil {
		return fmt.Errorf("read config: %w", err)
	}
	return nil
}
```

- 上下文价值: 包装说明哪一步失败;
- 原始错误: 保留具体原因;
- 调用者: 仍可用 Is/As 做结构化判断;

```go
err := fmt.Errorf("read config: %w", os.ErrNotExist)
println(errors.Is(err, os.ErrNotExist)) // true
// 此片段需要导入 fmt、os、errors。
```

## 如何判断错误？ errors.Is 的作用是什么？

- `errors.Is`: 判断错误链中是否存在目标错误;

```go
if errors.Is(err, os.ErrNotExist) {
	return nil
}
```

- 匹配边界: `errors.Is` 会检查包装关系;
- 也支持: 错误类型自定义的 Is 规则;
- 不能替代: 直接 `err == target`;

## 如何提取错误类型？ errors.As 的作用是什么？

- `errors.As`: 从错误链中提取可赋值给目标类型的错误;

```go
var pathErr *os.PathError
if errors.As(err, &pathErr) {
	println(pathErr.Path)
}
```

- 目标参数: `errors.As` 的 target 必须是非 nil 指针;
- 指向: 错误类型或接口;
- 例: 传 `&pathErr` 才能让函数写入提取结果;
