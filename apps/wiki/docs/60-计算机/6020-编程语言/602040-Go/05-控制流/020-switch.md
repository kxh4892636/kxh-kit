---
id: f7614ee8-d45e-5745-bfc4-7991cade0cfe
---

# switch

表达式 switch是什么？无表达式 switch是什么？fallthrough是什么？

## 表达式 switch

### 表达式 switch的核心规则

- 自动 break: 每个 case 默认不会继续执行下一个 case;
- default: 可放在任意 case 位置, 通常放在最后;

### 表达式 switch的写法

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

## 无表达式 switch

### 无表达式 switch的写法

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

## fallthrough

### fallthrough的核心规则

- `fallthrough`: 不能用于最后一个 case;
- 使用建议: 少用, 避免破坏 switch 默认清晰语义;

### fallthrough的写法

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
