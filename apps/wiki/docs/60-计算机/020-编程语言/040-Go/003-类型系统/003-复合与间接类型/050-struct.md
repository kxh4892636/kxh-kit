---
id: b17ea17a-3b39-55eb-bb48-aa7f18cd98b4
---

# struct

## struct 如何把多个字段组合成一个值？

- struct: 将多个字段组合成一个自定义类型;
- 字段名: 同一个 struct 内必须唯一;
- 零值: 每个字段为对应类型零值;

```go
type User struct {
	Name string // 导出字段;包外可见
	Age  int
}
```

## struct 有哪些初始化和访问字段的方式？

- 初始化方式: 命名字段写法不依赖字段顺序，省略字段保留零值；按位置初始化必须匹配字段列表，结构变化时更脆弱;

```go
func main() {
	a := User{}
	b := User{Name: "Tom", Age: 18} // 命名字段初始化;推荐使用
	c := User{"Jerry", 20}          // 顺序初始化;依赖字段顺序
	b.Age = 19
	println(a.Name, b.Age, c.Name)
}
```

## Go 如何写构造函数？ NewType 约定是什么？

- 构造函数: Go 没有内置 constructor 语法;
- 约定命名: 使用 `NewType` 普通函数创建并初始化值;
- 返回类型: 可按需求返回值或指针;

```go
func NewUser(name string, age int) *User {
	return &User{Name: name, Age: age}
}
```

## struct 复制后哪些数据仍可能共享？

- 赋值: 整体复制所有字段, 副本与原值独立;
- 共享字段: slice、map、pointer 等字段只复制自身的描述或地址，底层数据仍可能共享；统一复制模型见[类型系统](../001-类型基础/010-类型系统.md);
- 可比较: 字段全部可比较时 struct 才可比较; 内容相等不代表同一对象;

```go
type Group struct {
	Name    string
	Members []string
}

g1 := Group{Name: "Red", Members: []string{"Tom"}}
g2 := g1 // Group 值拷贝, 但 Members 共享底层数组

g2.Name = "Blue"
g2.Members[0] = "Jerry"

println(g1.Name)       // Red, 普通字段不受影响
println(g1.Members[0]) // Jerry, 切片底层数据共享
```
