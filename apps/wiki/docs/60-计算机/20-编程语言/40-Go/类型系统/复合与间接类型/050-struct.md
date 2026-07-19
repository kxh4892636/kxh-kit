---
id: b17ea17a-3b39-55eb-bb48-aa7f18cd98b4
---

# struct

## 基本概念

### 概念

- struct: 将多个字段组合成一个自定义类型;
- 字段名: 同一个 struct 内必须唯一;
- 零值: 每个字段为对应类型零值;

```go
type User struct {
	Name string // 导出字段；包外可见
	Age  int
}
```

## 初始化和访问

```go
func main() {
	a := User{}
	b := User{Name: "Tom", Age: 18} // 命名字段初始化；推荐使用
	c := User{"Jerry", 20}          // 顺序初始化；依赖字段顺序
	b.Age = 19
	println(a.Name, b.Age, c.Name)
}
```

## 构造函数

### 概念

- 构造函数: Go 没有内置 constructor 语法;
- 约定命名: 使用 `NewType` 普通函数创建并初始化值;
- 返回类型: 可按需求返回值或指针;

```go
func NewUser(name string, age int) *User {
	return &User{Name: name, Age: age}
}
```

## 嵌入字段

### 概念

- embedded field: 只写类型名的匿名字段;
- 字段提升: 可通过外层 struct 直接访问嵌入字段成员;
- 组合复用: Go 使用嵌入表达组合关系;

```go
type Address struct {
	City string
}

type User struct {
	Name string
	Address
}

u := User{Name: "Tom", Address: Address{City: "Beijing"}}
println(u.City) // Beijing
```

## 空结构体

### 概念

- `struct{}`: 不包含字段的结构体;
- 使用场景: set、只传递信号的 channel;

```go
func main() {
	seen := map[string]struct{}{}
	seen["go"] = struct{}{}
	_, ok := seen["go"]
	println(ok)
}
```
