---
id: 30cab41a-0e9b-4e67-9063-9fcdd39f63aa
---

# recover

## 基本概念

### 概念

- recover: 捕获当前 goroutine 正在传播的 panic;
- 调用位置: 必须在 defer 函数中直接调用;
- 返回值: 存在 panic 时返回传给 `panic` 的值，否则返回 nil;
- 恢复效果: 捕获后停止 panic 继续向上传播;
- 执行恢复: 不会回到 `panic` 后继续执行，当前函数从 defer 后返回;

## 语法格式

```go
package main

import "fmt"

func safeRun() {
	defer func() {
		if v := recover(); v != nil {
			fmt.Println("recover:", v)
		}
	}()

	panic("boom")
	fmt.Println("after panic") // 不会执行
}

func main() {
	safeRun()
	fmt.Println("after safeRun") // main 继续执行
}

// 输出:
// recover: boom
// after safeRun
```

## 使用边界

- 适用位置: goroutine 边界、框架边界、任务边界兜底;
- 作用范围: 只处理当前 goroutine 中正在传播的 panic;
- 控制流: 恢复后由发生 panic 的函数返回，不从 panic 点继续;

## 机制对比

| 机制      | 用途                                   |
| --------- | -------------------------------------- |
| `error`   | 可预期失败，由调用方处理               |
| `panic`   | 不可恢复或不应继续的异常状态           |
| `recover` | goroutine 边界、框架边界、任务边界兜底 |
