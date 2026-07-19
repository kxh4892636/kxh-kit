---
id: a383fb66-4f42-502c-879d-4550fa28fe71
---

# error

## 基本概念

### 概念

- error: Go 标准错误接口;
- 错误值: 普通返回值, 不是异常控制流;
- 返回约定: error 通常作为最后一个返回值;
- nil error: 表示没有错误;

### 定义

```go
type error interface {
	Error() string // 返回错误描述文本
}
```

## 返回错误

### 语法格式

```go
import "errors"

func div(a, b int) (int, error) {
	if b == 0 {
		return 0, errors.New("divide by zero") // 创建错误值
	}
	return a / b, nil // nil error 表示成功
}
```

## 处理错误

### 语法格式

```go
func main() {
	n, err := div(10, 0)
	if err != nil { // 先检查错误, 再使用正常返回值
		println(err.Error())
		return
	}
	println(n)
}
```

## 包装错误

### 语法格式

```go
import "fmt"

func load() error {
	if err := read(); err != nil {
		return fmt.Errorf("read config: %w", err) // %w 包装原始错误并保留错误链
	}
	return nil
}
```

## 判断错误

### 语法格式

```go
if errors.Is(err, os.ErrNotExist) { // 判断错误链中是否存在目标错误
	return nil
}
```

## 提取错误类型

### 语法格式

```go
var pathErr *os.PathError
if errors.As(err, &pathErr) { // 从错误链中提取 *os.PathError
	println(pathErr.Path)
}
```
