---
id: bf2d5032-8c09-4c94-b2b5-d4a8de65dda7
---

# 函数-方法-defer

## 函数

### 声明

#### 概念

- function declaration: 使用 `func` 声明函数;
- 函数签名: 参数列表和返回值列表;
- 函数体: 写在花括号中;

#### 语法格式

```go
// add 接收两个 int 参数并返回一个 int
func add(a int, b int) int {
	return a + b
}
```

### 参数简写

#### 语法格式

```go
// a, b int 表示 a 和 b 都是 int
func add(a, b int) int {
	return a + b
}
```

### 多返回值

#### 概念

- multiple results: 函数可返回多个值;
- 常见形式: `(value, ok)` 或 `(value, error)`;
- return: 返回值数量和类型必须匹配签名;

#### 语法格式

```go
func div(a, b int) (int, bool) {
	if b == 0 {
		return 0, false // 使用 bool 表示除法是否成功
	}
	return a / b, true
}
```

### 具名返回值

#### 概念

- named result: 返回值拥有名字;
- naked return: 无表达式 return;
- 使用建议: 短函数可用, 长函数慎用;

#### 语法格式

```go
func split(sum int) (x int, y int) {
	x = sum / 2 // x 是具名返回值, 在函数体内作为局部变量使用
	y = sum - x
	return // naked return 返回 x 和 y 当前值
}
```

### 可变参数

#### 概念

- variadic parameter: 使用 `...T` 接收任意数量参数;
- 位置限制: 可变参数必须是最后一个参数;

#### 语法格式

```go
func sum(nums ...int) int { // nums 在函数内部表现为 []int
	total := 0
	for _, n := range nums {
		total += n
	}
	return total
}
```

### 传参语义

#### 概念

- 参数传递: Go 按值传递;
- 修改调用方变量: 需要传指针或传递引用底层数据的值;

#### 语法格式

```go
func change(n int) {
	n = 100 // 修改的是参数副本
}

func main() {
	x := 1
	change(x)
	println(x) // 输出 1
}
```

### 内置函数

#### 函数表

| 函数 | 描述 |
| ---- | ---- |
| `len` | 返回 string、array、slice、map、channel 长度 |
| `cap` | 返回 array、slice、channel 容量 |
| `make` | 创建 slice、map、channel |
| `new` | 分配零值并返回指针 |
| `append` | 追加 slice 元素 |
| `copy` | 复制 slice 元素 |
| `delete` | 删除 map key |
| `close` | 关闭 channel |
| `clear` | 清空 map 或将 slice 元素置零 |
| `complex` | 根据实部和虚部构造复数 |
| `real` | 返回复数实部 |
| `imag` | 返回复数虚部 |
| `min` | 返回一组有序值中的最小值 |
| `max` | 返回一组有序值中的最大值 |
| `panic` | 触发 panic |
| `recover` | 捕获正在传播的 panic |
| `print` / `println` | 输出实现相关调试信息 |

#### 语法格式

```go
func main() {
	s := make([]int, 0, 4) // make 创建 slice
	s = append(s, 1)       // append 返回新 slice
	println(len(s), cap(s))
}
```

## 函数值

### 匿名函数

#### 语法格式

```go
func main() {
	add := func(a, b int) int { // 匿名函数赋值给变量 add
		return a + b
	}
	println(add(1, 2))
}
```

### 闭包

#### 概念

- closure: 函数值引用其外层作用域变量;
- 使用场景: 封装状态、生成函数;

#### 语法格式

```go
func counter() func() int {
	n := 0
	return func() int {
		n++      // 闭包引用外层变量 n
		return n // n 在 counter 返回后仍可继续存在
	}
}
```

## defer

### 基本概念

#### 概念

- `defer`: 延迟执行函数调用;
- 执行时机: 当前函数返回前执行;
- 执行顺序: 后注册的 defer 先执行;

#### 语法格式

```go
package main

import "fmt"

func main() {
	defer fmt.Println("last") // 延迟到 main 返回前执行
	fmt.Println("first")
}
```

### 参数求值

#### 语法格式

```go
package main

import "fmt"

func main() {
	n := 1
	defer fmt.Println(n) // 注册 defer 时立即求值为 1
	n = 2
}
```

### 限制

#### 概念

- defer 目标: 必须是函数或方法调用;
- defer 参数: 注册 defer 时求值;
- defer 返回值: 延迟调用的返回值会被丢弃;

#### 语法格式

```go
func main() {
	defer println("done") // 合法; defer 后是函数调用
}
```

### 资源释放

#### 概念

- 资源释放: 成功获取资源后立即注册 defer;
- 常见资源: 文件、锁、网络连接;

#### 语法格式

```go
package main

import "os"

func readFile(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close() // 成功获取资源后立即注册释放逻辑
	return nil
}
```

## 方法

### 声明

#### 概念

- method: 带 receiver 的函数;
- receiver 类型: 当前包内定义的类型或其指针;

#### 语法格式

```go
type User struct {
	Name string
}

// User 为 receiver 类型; Greet 为 User 的方法
func (u User) Greet() string {
	return "hello " + u.Name
}
```

### 值接收者

#### 概念

- value receiver: 调用时复制 receiver 值;
- 使用场景: 小值类型、不可变语义;

#### 语法格式

```go
func (u User) Rename(name string) {
	u.Name = name // 修改 receiver 副本, 不改变原 User
}
```

### 指针接收者

#### 概念

- pointer receiver: 接收指向原值的指针;
- 使用场景: 需要修改 receiver、大对象避免复制、保持方法集合一致;

#### 语法格式

```go
func (u *User) Rename(name string) {
	u.Name = name // 通过指针修改原 User
}
```

### 方法调用

#### 语法格式

```go
func main() {
	u := User{Name: "Tom"}
	u.Rename("Jerry") // 可寻址值调用指针接收者方法时, 编译器可自动取地址
	println(u.Greet())
}
```

### 方法集合

#### 概念

- method set: 一个类型可调用或可用于实现接口的方法集合;
- `T` 方法集合: 包含 receiver 为 `T` 的方法;
- `*T` 方法集合: 包含 receiver 为 `T` 和 `*T` 的方法;
- 接口实现: 类型的方法集合覆盖接口方法集合即实现接口;

#### 语法格式

```go
type N int

func (n N) Value() int  { return int(n) } // 属于 N 和 *N 方法集合
func (n *N) Inc()       { *n = *n + 1 }   // 只属于 *N 方法集合
```

### 方法表达式

#### 语法格式

```go
func main() {
	fn := User.Greet            // method expression; receiver 变成第一个参数
	println(fn(User{Name: "Tom"}))
}
```

### 方法值

#### 语法格式

```go
func main() {
	u := User{Name: "Tom"}
	fn := u.Greet // method value; receiver 已绑定到函数值
	println(fn())
}
```

### 类型嵌入

#### 概念

- embedded type: struct 嵌入字段的方法可提升到外层类型;
- 方法提升: 外层值可直接调用嵌入字段的方法;
- 冲突处理: 同名方法或字段可能导致选择器歧义;
