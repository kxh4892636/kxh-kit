---
id: 7623ad0d-3b0d-506a-849c-5e808ed7d3f9
---

# pointer

## 基本概念

### 概念

- pointer: 保存变量内存地址的值;
- 零值: `nil`;
- nil 解引用: 运行时 panic;

```go
func main() {
	x := 10
	p := &x // & 获取变量地址
	*p = 20 // * 解引用并修改指向的值
	println(x) // 20
}
```

## 指针参数

```go
func addOne(p *int) {
	*p = *p + 1
}

func main() {
	n := 1
	addOne(&n)
	println(n) // 2
}
```

## new

### 概念

- `new(T)`: 分配 `T` 的零值并返回 `*T`;
- `make`: 只用于 slice、map、channel;

```go
func main() {
	p := new(int)
	*p = 10
	println(*p)
}
```

## 多级指针

```go
func main() {
	x := 1
	p := &x  // *int
	pp := &p // **int
	**pp = 2
	println(x)
}
```
