---
id: 71ae5a8c-caf0-4cb7-93c7-e81b53347b7a
---

# error 包装与检查

包装错误是什么？判断错误是什么？提取错误类型包含什么，如何选择？检查方式包含什么，如何选择？

## 包装错误

### 包装错误的核心规则

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

## 判断错误

### 判断错误的核心规则

- `errors.Is`: 判断错误链中是否存在目标错误;

```go
if errors.Is(err, os.ErrNotExist) {
	return nil
}
```

## 提取错误类型

### 提取错误类型的核心规则

- `errors.As`: 从错误链中提取可赋值给目标类型的错误;

```go
var pathErr *os.PathError
if errors.As(err, &pathErr) {
	println(pathErr.Path)
}
```

## 检查方式

| 目标                 | API                  |
| -------------------- | -------------------- |
| 保留原始错误链       | `fmt.Errorf` 与 `%w` |
| 判断是否包含目标错误 | `errors.Is`          |
| 提取具体错误类型     | `errors.As`          |
