---
id: 78bf1e10-ddc4-5f55-9681-a0d950869c6f
---

# range

## 如何用 range 遍历 slice? 下标与元素值是什么?

### 遍历 slice的写法

```go
func main() {
	nums := []int{10, 20, 30}
	for i, v := range nums { // i 为下标; v 为元素值副本
		println(i, v)
	}
}
```

## 如何用 range 遍历 map? 遍历顺序是否稳定?

### 遍历 map的写法

```go
func main() {
	m := map[string]int{"a": 1, "b": 2}
	for k, v := range m {
		println(k, v) // map 遍历顺序不保证稳定
	}
}
```

## 如何用 range 遍历 string? 下标与 rune 是什么含义?

### 遍历 string的写法

```go
func main() {
	for i, r := range "语言" {
		println(i, r) // i 为 rune 起始字节位置; r 为当前 Unicode code point
	}
}
```

## range 如何忽略不需要的返回值?

### 忽略返回值的写法

```go
func main() {
	nums := []int{1, 2, 3}
	for _, v := range nums { // _ 丢弃不需要的 index
		println(v)
	}
}
```

## range 循环变量有哪些规则? 如何修改元素与使用地址?

### 循环变量的核心规则

- range value: 每轮迭代得到的是元素值副本;
- 修改元素: 需要通过 index 写回原集合;
- 地址使用: 需要区分循环变量地址和元素地址;

### 循环变量的写法

```go
func main() {
	nums := []int{1, 2, 3}
	for i, v := range nums {
		nums[i] = v * 10 // 通过 index 修改原 slice 元素
	}
}
```
