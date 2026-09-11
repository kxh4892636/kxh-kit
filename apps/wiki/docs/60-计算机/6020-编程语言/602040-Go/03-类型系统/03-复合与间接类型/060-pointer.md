---
id: 7623ad0d-3b0d-506a-849c-5e808ed7d3f9
---

# pointer

## pointer 是什么？ 零值与 nil 解引用如何表现？

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

## 指针参数如何修改调用方的变量？

- 指针参数: 调用方传入地址，函数复制该地址后通过 `*p` 修改同一个目标；给参数 `p` 重新赋值则只改变局部指针;

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

## 如何用 `new(T)` 创建指向零值的指针？

- `new(T)`: 分配 `T` 的零值并返回 `*T`;
- 与 make 区分: `make` 初始化 slice、map、channel 并返回对应类型的值，不返回 `*T`；完整入口见[内置函数](../../06-函数与调用/040-内置函数.md);

```go
func main() {
	p := new(int)
	*p = 10
	println(*p)
}
```

## 多级指针是什么？ 如何通过多级指针修改值？

- 多级指针: `**T` 指向一个 `*T` 变量，每次 `*` 向目标前进一步；使用前必须保证每一级指针都不为 nil;

```go
func main() {
	x := 1
	p := &x  // *int
	pp := &p // **int
	**pp = 2
	println(x)
}
```
