---
id: b60f0094-0f7c-52e4-bfb1-65a615e85708
---

# Import

## 基本导入

### 语法格式

```go
package main

// 导入标准库 fmt 包
import "fmt"

func main() {
	fmt.Println("hello") // 通过包名访问导出标识符
}
```

## 分组导入

### 概念

- 分组导入: 使用括号组织多个 import;
- gofmt: 自动排序和整理 import;

### 语法格式

```go
import (
	"fmt"       // 标准库包
	"math/rand" // 标准库包
)
```

## 别名导入

### 语法格式

```go
// random 为当前文件内使用的导入别名
import random "math/rand"

func main() {
	println(random.Intn(10))
}
```

## 空导入

### 语法格式

```go
// 空导入只触发目标包 init 副作用, 不直接使用导出标识符
import _ "database/sql"
```

## 点导入

### 语法格式

```go
// 点导入将 fmt 的导出标识符放入当前文件作用域; 普通业务代码不推荐
import . "fmt"

func main() {
	Println("hello")
}
```
