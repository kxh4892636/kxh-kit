---
id: 7623ad0d-3b0d-506a-849c-5e808ed7d3f9
---

# pointer

## 基本概念

### 概念

- pointer: 保存变量内存地址的值;
- 零值: `nil`;
- nil 解引用: 运行时 panic;

### 语法格式

```go
func main() {
	x := 10
	p := &x // & 获取变量地址
	*p = 20 // * 解引用指针并修改指向的值
	println(x) // 20
}
```

## 指针参数

### 语法格式

```go
func addOne(p *int) {
	*p = *p + 1 // 通过指针修改调用方变量
}

func main() {
	n := 1
	addOne(&n)
	println(n) // 2
}
```

## new

### 概念

- `new(T)`: 分配 T 的零值并返回 `*T`;
- `make`: 只用于 slice、map、channel;

### 语法格式

```go
func main() {
	p := new(int) // 分配 int 零值并返回 *int
	*p = 10
	println(*p) // 10
}
```

## uintptr

### 概念

- uintptr: 可保存指针位模式的整数类型;
- GC 语义: uintptr 不被垃圾回收器当作指针追踪;
- 使用限制: 普通业务代码不应把 uintptr 当安全指针使用;

## 多级指针

### 语法格式

```go
func main() {
	x := 1
	p := &x  // *int
	pp := &p // **int
	**pp = 2
	println(x)
}
```

## 指针限制

### 概念

- 指针算术: Go 不支持普通指针加减运算;
- 临时值取址: 不可对不可寻址的临时结果直接取地址;
- 安全边界: 需要底层地址运算时通常涉及 `unsafe`;
