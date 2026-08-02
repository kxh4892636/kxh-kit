---
id: a383fb66-4f42-502c-879d-4550fa28fe71
---

# error 返回与处理

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

```go
import "errors"

func div(a, b int) (int, error) {
	if b == 0 {
		return 0, errors.New("divide by zero")
	}
	return a / b, nil
}
```

## 处理错误

```go
func main() {
	n, err := div(10, 0)
	if err != nil { // 先检查错误,再使用正常返回值
		println(err.Error())
		return
	}
	println(n)
}
```

## 调用约定

| 返回状态 | error 值 | 调用方行为             |
| -------- | -------- | ---------------------- |
| 成功     | `nil`    | 使用正常返回值         |
| 失败     | 非 `nil` | 先处理错误, 再决定流程 |
