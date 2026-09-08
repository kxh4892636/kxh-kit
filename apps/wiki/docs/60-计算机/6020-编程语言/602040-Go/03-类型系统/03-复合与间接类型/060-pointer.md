---
id: 7623ad0d-3b0d-506a-849c-5e808ed7d3f9
---

# pointer

## pointer 是什么? 零值与 nil 解引用如何表现?

### pointer是什么的核心规则

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

## 指针参数如何修改调用方的变量?

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

## new 是什么? 它与 make 有何区别?

### new的核心规则

- `new(T)`: 分配 `T` 的零值并返回 `*T`;
- `make`: 只用于 slice, map, channel;

```go
func main() {
	p := new(int)
	*p = 10
	println(*p)
}
```

## 多级指针是什么? 如何通过多级指针修改值?

```go
func main() {
	x := 1
	p := &x  // *int
	pp := &p // **int
	**pp = 2
	println(x)
}
```
