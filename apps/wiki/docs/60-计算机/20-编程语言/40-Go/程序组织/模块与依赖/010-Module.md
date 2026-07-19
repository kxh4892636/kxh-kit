---
id: 21fd7a38-20f9-57eb-be76-6994decc9c13
---

# Module

## 基本概念

### 定义

- module: 一组共享同一 module path 的 Go package 集合;
- module path: 当前 module 被导入时使用的根路径;
- `go.mod`: 记录 module path、Go 版本和直接依赖;
- `go.sum`: 校验下载的依赖内容未被篡改;

## 创建模块

### 命令

```bash
mkdir hello
cd hello
go mod init example.com/hello # 创建 go.mod 并写入 module path
```

## replace

### 语法格式

```go
// 替换为本地目录；常用于本地联调或临时 fork
replace example.com/lib => ../lib
```

## 核心文件

| 文件       | 作用                                   |
| ---------- | -------------------------------------- |
| `go.mod`   | 声明 module 身份、Go 版本和直接依赖    |
| `go.sum`   | 保存依赖内容的校验信息                 |
