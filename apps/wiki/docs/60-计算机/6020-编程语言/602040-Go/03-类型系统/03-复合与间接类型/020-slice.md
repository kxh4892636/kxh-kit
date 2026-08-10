---
id: a00bdeac-164d-5fc7-a706-1bb335cef8bf
---

# slice

slice是什么？创建方式包含什么，如何选择？nil 和 empty slice是什么？状态对比说明什么？

## slice是什么

### slice是什么的核心规则

- slice: 指向底层数组一段连续元素的描述符;
- 长度: 当前可访问元素数量;
- 容量: 从起始位置到底层数组末尾的可扩展空间;

### slice是什么的写法

```go
func main() {
	var zero []int       // nil slice;len 和 cap 均为 0
	s := []int{1, 2, 3} // 指向底层数组的一段连续元素
	println(len(zero), cap(zero), len(s), cap(s))
}
```

## 创建方式

```go
func main() {
	a := []int{1, 2, 3}    // slice literal
	b := make([]int, 3)    // 长度为 3,容量为 3
	c := make([]int, 0, 8) // 长度为 0,容量为 8
	println(len(a), len(b), cap(c))
}
```

## nil 和 empty slice

### nil 和 empty slice的核心规则

- nil slice: 指针为 nil, 长度和容量为 0;
- empty slice: 指针非 nil, 长度为 0;
- `append`: nil slice 和 empty slice 均可直接追加元素;

```go
type slice struct {
	array unsafe.Pointer // 底层数组指针
	len   int
	cap   int
}
```

### nil 和 empty slice的写法

```go
func main() {
	var nilSlice []int
	emptySlice := []int{}
	println(nilSlice == nil)   // true
	println(emptySlice == nil) // false
}
```

## 状态对比

| 状态        | 是否为 nil | `len` | `cap`          | 可直接 `append` |
| ----------- | ---------- | ----- | -------------- | --------------- |
| nil slice   | 是         | 0     | 0              | 是              |
| empty slice | 否         | 0     | 由创建方式决定 | 是              |
