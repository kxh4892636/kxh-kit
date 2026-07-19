---
id: b60f0094-0f7c-52e4-bfb1-65a615e85708
---

# Import

## 基本导入

```go
package main

import "fmt"

func main() {
	fmt.Println("hello") // 通过包名访问导出标识符
}
```

## 分组导入

### 概念

- 分组导入: 使用括号组织多个 `import`;
- `gofmt`: 自动排序和整理 `import`;

```go
import (
	"fmt"
	"math/rand"
)
```

## 别名导入

```go
import random "math/rand"

func main() {
	println(random.Intn(10))
}
```

## 空导入

```go
// 只触发目标包 init 副作用，不直接使用导出标识符
import _ "database/sql"
```

## 点导入

```go
// 将 fmt 的导出标识符放入当前文件作用域；普通业务代码不推荐
import . "fmt"

func main() {
	Println("hello")
}
```

## 导入形式

| 形式       | 当前文件中的访问方式       |
| ---------- | -------------------------- |
| 普通导入   | 使用 package 名限定        |
| 别名导入   | 使用指定别名限定           |
| 空导入     | 不访问，仅触发初始化副作用 |
| 点导入     | 直接访问导出标识符         |
