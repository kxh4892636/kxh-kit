---
id: 66e72704-a872-5b41-a33c-7fdcb5c53b17
---

# Package

## 基本概念

### 定义

- package: Go 代码的基本组织单位;
- 目录与包: 一个目录通常对应一个 package;
- 包名: 源文件 `package name` 声明的名字;
- 导入路径: import 使用的字符串路径, 不等于包名本身;

## main 包

### 语法格式

```go
// main 包表示当前 package 可编译为可执行程序
package main

// main 函数为程序入口; main 返回后进程结束
func main() {
	println("start")
}
```

## 普通包

### 语法格式

```go
// calc 为普通库包; 不能单独作为可执行程序入口
package calc

// Add 首字母大写; 可被其他 package 访问
func Add(a int, b int) int {
	return a + b
}
```

## init 函数

### 语法格式

```go
package config

var Loaded bool

// init 在包初始化时自动调用一次; 不能被代码显式调用
func init() {
	Loaded = true
}
```

### 执行顺序

- 被导入包: 先于当前包初始化;
- 当前包变量: 先于当前包 `init` 初始化;
- 多个 `init`: 按文件和声明顺序执行;
