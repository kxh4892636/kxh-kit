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

## defer 的作用域边界在哪？

- 作用域: defer 绑定整个函数;
- 循环中: 一轮结束不会执行它;
- 风险: 循环里反复登记清理会让资源堆积到函数返回;

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

## 实参与闭包的求值时机差在哪？

- 普通实参: 延迟调用时立即求值;
- 闭包函数体: 读取外层变量会延后;
- 具名返回值: 结果确定后可被 defer 修改;
