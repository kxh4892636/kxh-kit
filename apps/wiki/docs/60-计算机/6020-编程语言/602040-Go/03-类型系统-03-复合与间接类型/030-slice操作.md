---
id: 46ad95bc-f8a2-45a5-b70e-6836e0a96dfc
---

# slice 操作

## 切片表达式如何取值？ 共享底层数组有何影响？

- 切片范围: `a[low:high]` 包含 `low`, 不包含 `high`;
- 底层数组: 新旧 slice 共享底层数组;
- 共享修改: 通过一个 slice 修改共享元素, 其他 slice 可观察到变化;

```go
func main() {
	a := []int{0, 1, 2, 3, 4}
	b := a[1:4] // 取下标 1 到 3
	b[0] = 10   // a[1] 同步变化
	println(a[1], len(b), cap(b))
}
```

- 容量限制: `a[low:high:max]` 将新切片容量限制为 `max-low`；后续追加超出此容量会分配新数组，但限制容量不会隔离已有元素的修改;

## append 的返回值和扩容规则是什么？

- 返回值: `append` 返回更新后的切片描述符，必须接收才能保留新长度以及可能变化的底层数组地址;
- 扩容: 容量不足时会分配新的底层数组;

```go
func main() {
	s := []int{1, 2}
	s = append(s, 3)
	s = append(s, 4, 5)
	println(len(s), cap(s))
}
```

## copy 的作用和返回值是什么？

- `copy(dst, src)`: 将元素从源 slice 复制到目标 slice;
- 返回值: 实际复制数量是 `min(len(dst), len(src))`；`copy` 不会自动增加目标长度，并允许源与目标重叠;

```go
func main() {
	src := []int{1, 2, 3}
	dst := make([]int, len(src))
	n := copy(dst, src)
	println(n, dst[0])
}
```

## 如何根据是否允许共享写入选择切片操作？

- 操作选择: 截取与共享修改见本篇切片表达式，追加与扩容见 `append`，独立复制见 `copy`；选择前先判断是否允许共享写入;
