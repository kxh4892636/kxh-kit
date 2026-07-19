---
id: a00bdeac-164d-5fc7-a706-1bb335cef8bf
---

# slice

## 基本概念

### 概念

- slice: 指向底层数组一段连续元素的描述符;
- 长度: 当前可访问元素数量;
- 容量: 从起始位置到底层数组末尾的可扩展空间;

### 语法格式

```go
func main() {
	var zero []int       // nil slice; len 和 cap 均为 0
	s := []int{1, 2, 3} // slice 指向底层数组的一段连续元素
	println(len(zero), cap(zero), len(s), cap(s))
}
```

## 创建方式

### 语法格式

```go
func main() {
	a := []int{1, 2, 3}     // slice literal
	b := make([]int, 3)     // 长度为 3, 容量为 3
	c := make([]int, 0, 8)  // 长度为 0, 容量为 8
	println(len(a), len(b), cap(c))
}
```

## nil 和 empty slice

### 概念

- nil slice: 值为 nil, 长度和容量为 0;
- empty slice: 值非 nil, 长度为 0;
- append: nil slice 和 empty slice 均可直接 append;

### 语法格式

```go
func main() {
	var nilSlice []int
	emptySlice := []int{}
	println(nilSlice == nil)   // true
	println(emptySlice == nil) // false
}
```

## 切片表达式

### 语法格式

```go
func main() {
	a := []int{0, 1, 2, 3, 4}
	b := a[1:4] // 取下标 1 到 3; 新旧 slice 共享底层数组
	b[0] = 10   // 修改共享元素; a[1] 同步变化
	println(a[1], len(b), cap(b))
}
```

## append

### 语法格式

```go
func main() {
	s := []int{1, 2}
	s = append(s, 3)    // append 返回新 slice; 必须接收返回值
	s = append(s, 4, 5) // 容量不足时会分配新底层数组
	println(len(s), cap(s))
}
```

## copy

### 语法格式

```go
func main() {
	src := []int{1, 2, 3}
	dst := make([]int, len(src))
	n := copy(dst, src) // 返回实际复制的元素数量
	println(n, dst[0])
}
```
