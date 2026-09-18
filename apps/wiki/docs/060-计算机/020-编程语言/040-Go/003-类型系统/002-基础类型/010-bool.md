---
id: aa3fde54-408b-5c80-b8e9-33f6b2675ffc
---

# bool

## `bool` 如何表示真假与默认状态？

- `bool`: 只保存 `true` 或 `false` 的布尔类型，用来表达“条件成立”或“条件不成立”;
- `true`: 条件成立;
- `false`: 条件不成立;
- 常见用途: `if`、`for`、逻辑运算和函数返回状态;
- 类型边界: Go 不会把整数 `0` 或 `1` 自动当作布尔值;

- `bool` 零值: `false`;
- 设计结果: 状态开关可以让 `false` 表示“尚未开启”，但名称必须说明 `true` 代表什么;

```go
var ready bool
println(ready) // false
ready = true
```

## 布尔值如何产生和组合？

- 比较运算: `==`、`!=`、`<`、`<=`、`>`、`>=` 会产生布尔值;
- 逻辑与 `&&`: 两侧都为 `true` 时结果才为 `true`;
- 逻辑或 `||`: 至少一侧为 `true` 时结果为 `true`;
- 逻辑非 `!`: 把 `true` 与 `false` 互换;
- 短路求值: 右侧是否执行由左侧决定，规则与示例见[运算符](../../004-表达式与运算/010-运算符.md);

```go
age := 20
hasTicket := true
canEnter := age >= 18 && hasTicket
```

## 使用布尔值时容易犯哪些错误？

- 含糊命名: `flag`、`status` 无法说明真假含义，优先使用 `ready`、`hasAccess` 等可读名称;
- 重复比较: `if ready == true` 没有增加信息，直接写 `if ready`;
- 反向条件: `disableCache` 容易产生双重否定，能用正向名称时优先用 `cacheEnabled`;
- 状态过多: 一个 `bool` 只能表达两种状态；若业务有多个互斥状态，应使用自定义类型或常量;

- 命名与分支: 让名字直接描述 true 的含义，条件分支就可以读成一句业务判断;

```go
cacheEnabled := true
if cacheEnabled {
    println("cache is enabled")
}
```
