---
id: 5a8eb027-592e-53fe-ae44-02b5264d4a6e
---

# defer

## defer 的执行时机与顺序是什么？

- `defer`: 延迟执行函数调用;
- 执行时机: 当前函数返回前执行;
- 执行顺序: 后注册的 `defer` 先执行;

```go
package main

import "fmt"

func main() {
	defer fmt.Println("last") // 延迟到 main 返回前执行
	fmt.Println("first")
}
```

- 作用域边界: defer 绑定整个函数，循环的一轮结束不会执行它；循环内反复登记资源清理可能让资源积累到函数返回;

```go
func order() {
    defer println("first registered")
    defer println("last registered")
    println("body")
}
// 输出顺序：body → last registered → first registered
```

## defer 的目标、参数求值与返回值有哪些约束？

- `defer` 目标: 必须是函数或方法调用;
- `defer` 参数: 注册 `defer` 时求值;
- `defer` 返回值: 延迟调用的返回值会被丢弃;

```go
package main

import "fmt"

func main() {
	n := 1
	defer fmt.Println(n) // 注册 defer 时立即求值为 1
	n = 2
}
```

- 闭包边界: 延迟调用的普通实参立即求值，但闭包函数体读取外层变量的动作会延后；具名返回值可在返回结果确定后被 defer 修改;
