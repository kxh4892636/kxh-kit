---
id: aa3fde54-408b-5c80-b8e9-33f6b2675ffc
---

# bool

## `bool` 如何表示真假与默认状态？

- `bool`: 只保存 `true` 或 `false` 的类型;
- 用途: 表达条件成立或不成立;
- `true`: 条件成立;
- `false`: 条件不成立;
- 常见用途: `if`、`for`、逻辑运算和函数返回状态;
- 类型边界: Go 不会把整数 `0` 或 `1` 自动当作布尔值;

## bool 的零值与命名有什么要求？

- `bool` 零值: `false`;
- 设计结果: 状态开关可让 `false` 表示尚未开启;
- 要求: 名称必须说明 `true` 代表什么;

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
- 短路求值: 右侧是否执行由左侧决定;
- 详见: [运算符](../../004-表达式与运算/010-运算符.md);

```go
age := 20
hasTicket := true
canEnter := age >= 18 && hasTicket
```

## 使用布尔值时容易犯哪些错误？

- 含糊命名: `flag`、`status` 说不清真假的含义;
- 建议: 用 `ready`、`hasAccess` 等可读名称;
- 重复比较: `if ready == true` 没有增加信息, 直接写 `if ready`;
- 反向条件: `disableCache` 容易产生双重否定;
- 建议: 能正向命名时用 `cacheEnabled`;
- 状态过多: 一个 `bool` 只能表达两种状态;
- 替代: 多个互斥状态用自定义类型或常量;

- 命名与分支: 让名字直接描述 true 的含义, 条件分支就可以读成一句业务判断;

```go
cacheEnabled := true
if cacheEnabled {
    println("cache is enabled")
}
```
