---
id: a383fb66-4f42-502c-879d-4550fa28fe71
---

# error 返回与处理

## error 是什么？ 错误返回有哪些约定？

- error: Go 标准错误接口;
- 错误值: 普通返回值, 不是异常控制流;
- 返回约定: error 通常作为最后一个返回值;
- nil error: 表示没有错误;

```go
type error interface {
	Error() string // 返回错误描述文本
}
```

## 如何返回错误？ errors.New 如何使用？

- 创建错误: `errors.New` 创建只有说明文本的错误值，适合直接解释当前失败；若需要保留下层原因，转到[错误包装](./020-error包装与检查.md);

```go
import "errors"

func div(a, b int) (int, error) {
	if b == 0 {
		return 0, errors.New("divide by zero")
	}
	return a / b, nil
}
```

## 调用方为什么应先检查 err 再使用结果？

- 处理顺序: 先判断 err，失败时按 API 约定处理；有些 API 同时返回部分有效结果与错误，能否使用结果必须依据该 API 契约;

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

| 返回状态 | error 值 | 调用方行为             |
| -------- | -------- | ---------------------- |
| 成功     | `nil`    | 使用正常返回值         |
| 失败     | 非 `nil` | 先处理错误, 再决定流程 |
