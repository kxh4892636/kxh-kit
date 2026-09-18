---
id: 78bf1e10-ddc4-5f55-9681-a0d950869c6f
---

# range

## 如何用 range 遍历 slice？ 下标与元素值是什么？

- 迭代结果: `range slice` 产生从零开始的下标和元素值副本；读取 `v` 适合处理内容，修改原元素则通过 `nums[i]` 写回;

```go
func main() {
	nums := []int{10, 20, 30}
	for i, v := range nums { // i 为下标; v 为元素值副本
		println(i, v)
	}
}
```

## 在哪里复习 map 的 range 规则？

- map 遍历入口: 键、值副本、无序性与稳定输出方案统一见[map](../003-类型系统/003-复合与间接类型/040-map.md);

## 在哪里复习字符串的 range 解码规则？

- 字符串遍历入口: UTF-8 解码、字节起始索引与 rune 的区别统一见[rune](../003-类型系统/002-基础类型/060-rune.md);

## range 如何忽略不需要的返回值？

- 忽略规则: 不需要下标时用 `_` 占位，不需要值时只写 `for i := range nums`；两个结果都不需要时可直接写 `for range nums`;

```go
func main() {
	nums := []int{1, 2, 3}
	for _, v := range nums { // _ 丢弃不需要的 index
		println(v)
	}
}
```

## range 循环变量有哪些规则？ 如何修改元素与使用地址？

- range value: 每轮迭代得到的是元素值副本;
- 修改元素: 需要通过 index 写回原集合;
- 地址使用: 需要区分循环变量地址和元素地址;

```go
func main() {
	nums := []int{1, 2, 3}
	for i, v := range nums {
		nums[i] = v * 10 // 通过 index 修改原 slice 元素
	}
}
```

- 循环变量版本: Go 1.22 起，用 `:=` 声明的迭代变量每轮各有新变量；使用 `=` 给已有变量赋值时仍复用它们，且 `&v` 始终不等于原集合元素地址;
