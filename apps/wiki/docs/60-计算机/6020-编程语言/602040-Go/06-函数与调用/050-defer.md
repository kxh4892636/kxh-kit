---
id: 5a8eb027-592e-53fe-ae44-02b5264d4a6e
---

# defer

## 执行时机与顺序

### 概念

- `defer`: 延迟执行函数调用;
- 执行时机: 当前函数返回前执行;
- 执行顺序: 后注册的 `defer` 先执行;

### 语法格式

```go
package main

import "fmt"

func main() {
	defer fmt.Println("last") // 延迟到 main 返回前执行
	fmt.Println("first")
}
```

## defer 约束

### 概念

- `defer` 目标: 必须是函数或方法调用;
- `defer` 参数: 注册 `defer` 时求值;
- `defer` 返回值: 延迟调用的返回值会被丢弃;

### 参数求值示例

```go
package main

import "fmt"

func main() {
	n := 1
	defer fmt.Println(n) // 注册 defer 时立即求值为 1
	n = 2
}
```
