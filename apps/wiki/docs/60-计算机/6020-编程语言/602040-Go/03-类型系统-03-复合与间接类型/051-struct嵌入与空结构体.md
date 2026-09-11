---
id: c7bd861f-b58c-4c8e-aaa8-438a389d8e4b
---

# struct 嵌入与空结构体

## struct 嵌入字段是什么？ 字段提升与组合复用如何工作？

- embedded field: 嵌入字段只写类型名或允许的指针类型，字段名由类型名隐式确定，并非真的没有名字;
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

- 初始化边界: 提升字段只能便捷访问，外层复合字面量仍应写 `Address: Address{...}`；方法提升与同名冲突见[类型嵌入与方法提升](../06-函数与调用/090-类型嵌入与方法提升.md);

## 空结构体是什么？ 有哪些使用场景？

- `struct{}`: 不包含字段的结构体;
- 使用场景: set, 只传递信号的 channel;

```go
func main() {
	seen := map[string]struct{}{}
	seen["go"] = struct{}{}
	_, ok := seen["go"]
	println(ok)
}
```

- 建模含义: `map[T]struct{}` 只记录键是否属于集合，`chan struct{}` 只传递事件是否发生；两者都不需要额外业务载荷;
