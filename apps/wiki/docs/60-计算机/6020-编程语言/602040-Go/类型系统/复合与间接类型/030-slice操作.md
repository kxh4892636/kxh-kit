---
id: 46ad95bc-f8a2-45a5-b70e-6836e0a96dfc
---

# slice 操作

## 切片表达式

### 概念

- 切片范围: `a[low:high]` 包含 `low`, 不包含 `high`;
- 底层数组: 新旧 slice 共享底层数组;
- 共享修改: 通过一个 slice 修改共享元素, 其他 slice 可观察到变化;

### 语法格式

```go
func main() {
	a := []int{0, 1, 2, 3, 4}
	b := a[1:4] // 取下标 1 到 3
	b[0] = 10   // a[1] 同步变化
	println(a[1], len(b), cap(b))
}
```

## append

### 概念

- 返回值: `append` 返回新的 slice, 必须接收;
- 扩容: 容量不足时会分配新的底层数组;

```go
func main() {
	s := []int{1, 2}
	s = append(s, 3)
	s = append(s, 4, 5)
	println(len(s), cap(s))
}
```

## copy

### 概念

- `copy(dst, src)`: 将元素从源 slice 复制到目标 slice;
- 返回值: 实际复制的元素数量;

```go
func main() {
	src := []int{1, 2, 3}
	dst := make([]int, len(src))
	n := copy(dst, src)
	println(n, dst[0])
}
```

## 操作影响

| 操作       | 底层存储关系                 |
| ---------- | ---------------------------- |
| 切片表达式 | 与原 slice 共享底层数组      |
| `append`   | 容量不足时可能分配新底层数组 |
| `copy`     | 把元素复制到目标 slice       |
