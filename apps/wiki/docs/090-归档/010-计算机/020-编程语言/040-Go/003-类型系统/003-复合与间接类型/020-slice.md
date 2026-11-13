---
id: a00bdeac-164d-5fc7-a706-1bb335cef8bf
---

# slice

## slice 是什么？ 长度和容量分别指什么？

- slice: 指向底层数组一段连续元素的描述符;
- 长度: 当前可访问元素数量;
- 容量: 从起始位置可重新切片的最大长度;
- 默认: 通常延伸到底层数组末尾;
- 收紧: 三下标切片可主动缩小该边界;

```go
func main() {
	var zero []int       // nil slice;len 和 cap 均为 0
	s := []int{1, 2, 3} // 指向底层数组的一段连续元素
	println(len(zero), cap(zero), len(s), cap(s))
}
```

## slice 有哪些创建方式？

- 字面量: 用于已知元素;
- `make([]T, n)`: 创建 n 个零值元素;
- `make([]T, 0, n)`: 只预留容量, 追加前无可索引元素;

```go
func main() {
	a := []int{1, 2, 3}    // slice literal
	b := make([]int, 3)    // 长度为 3,容量为 3
	c := make([]int, 0, 8) // 长度为 0,容量为 8
	println(len(a), len(b), cap(c))
}
```

## 如何区分 nil slice 与非 nil 的空 slice？

- nil slice: 指针为 nil, 长度和容量为 0;
- empty slice: 广义指长度为零的切片, 包含 nil slice;
- 这里对比: `[]T{}` 等非 nil 的空切片;
- `append`: nil slice 和 empty slice 均可直接追加元素;

```go
// 用于理解描述符的示意结构，不是需要用户定义的 Go 内置类型。
type slice struct {
	array unsafe.Pointer // 底层数组指针
	len   int
	cap   int
}
```

```go
func main() {
	var nilSlice []int
	emptySlice := []int{}
	println(nilSlice == nil)   // true
	println(emptySlice == nil) // false
}
```

| 状态        | 是否为 nil | `len` | `cap`          | 可直接 `append` |
| ----------- | ---------- | ----- | -------------- | --------------- |
| nil slice   | 是         | 0     | 0              | 是              |
| empty slice | 否         | 0     | 由创建方式决定 | 是              |

- 长度为零: 回答有没有元素;
- 与 nil 比较: 回答是不是零值切片;
- 结论: 这是两个不同问题;

```go
var a []int
b := make([]int, 0, 8)
println(len(a) == 0, len(b) == 0) // true true
println(a == nil, b == nil) // true false
```
