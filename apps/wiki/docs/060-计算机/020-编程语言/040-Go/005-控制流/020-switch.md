---
id: f7614ee8-d45e-5745-bfc4-7991cade0cfe
---

# switch

## 表达式 switch 如何使用, 自动 break 与 default 有何规则？

- 自动 break: 每个 case 默认不会继续执行下一个 case;
- default: 可放在任意 case 位置, 通常放在最后;

```go
func main() {
	day := "Mon"
	switch day {
	case "Sat", "Sun": // 多值 case 使用逗号分隔
		println("weekend")
	case "Mon":
		println("start")
	default: // 没有 case 匹配时执行
		println("workday")
	}
}
```

## 无表达式 switch 如何使用, 等价于什么写法？

- 条件列表: 省略 switch 表达式等价于 `switch true`，适合把多个互斥条件写成平行分支；只执行首个匹配项;

```go
func main() {
	n := 10
	switch { // 等价于 switch true
	case n < 0:
		println("negative")
	case n == 0:
		println("zero")
	default:
		println("positive")
	}
}
```

## fallthrough 有什么规则与使用建议？

- `fallthrough`: 作为表达式 switch 某个非末尾分支的最后一条非空语句，直接进入下一分支而不再检查其条件；不能用于 type switch;
- 使用建议: 少用, 避免破坏 switch 默认清晰语义;

```go
func main() {
	n := 1
	switch n {
	case 1:
		println("one")
		fallthrough // 强制继续执行下一个 case
	case 2:
		println("next")
	}
}
```
