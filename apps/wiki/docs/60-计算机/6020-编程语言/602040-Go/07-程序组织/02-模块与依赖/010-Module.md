---
id: 21fd7a38-20f9-57eb-be76-6994decc9c13
---

# Module

## Module 是什么? module path 有何作用?

### Module是什么的定义

- module: 一组共享同一 module path 的 Go package 集合;
- module path: 当前 module 被导入时使用的根路径;
- `go.mod`: 记录 module path, Go 版本和直接依赖;
- `go.sum`: 校验下载的依赖内容未被篡改;

## 如何创建模块? go mod init 做了什么?

### 命令

```bash
mkdir hello
cd hello
go mod init example.com/hello # 创建 go.mod 并写入 module path
```

## go.mod 中 replace 的作用是什么? 适用哪些场景?

### replace的写法

```go
// 替换为本地目录;常用于本地联调或临时 fork
replace example.com/lib => ../lib
```

## Module 的核心文件有哪些? 各自的作用是什么?

| 文件     | 作用                                |
| -------- | ----------------------------------- |
| `go.mod` | 声明 module 身份, Go 版本和直接依赖 |
| `go.sum` | 保存依赖内容的校验信息              |
