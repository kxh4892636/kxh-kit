---
id: c7bd861f-b58c-4c8e-aaa8-438a389d8e4b
---

# struct 嵌入与空结构体

## 嵌入字段

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
