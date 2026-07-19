---
id: 21fd7a38-20f9-57eb-be76-6994decc9c13
---

# Module

## 基本概念

### 定义

- module: 一组共享同一 module path 的 Go package 集合;
- `go.mod`: module 配置文件, 记录 module path、Go 版本、直接依赖;
- `go.sum`: 依赖内容校验文件, 用于校验下载内容未被篡改;
- module path: 当前 module 被导入时使用的根路径;

## 创建模块

### 命令

```bash
mkdir hello # 创建项目目录
cd hello # 进入项目目录
go mod init example.com/hello # 创建 go.mod 并写入 module path
```

## 依赖管理

### 命令

```bash
go get github.com/google/uuid@latest # 添加或升级依赖到最新版本
go get github.com/google/uuid@none # 删除指定依赖
go mod tidy # 根据源码 import 补齐和清理 go.mod/go.sum
```

## replace

### 语法格式

```go
// 将 example.com/lib 替换为本地 ../lib; 常用于本地联调或临时 fork
replace example.com/lib => ../lib
```

## 版本规则

### 概念

- `v0`: 初始阶段, 兼容性不稳定;
- `v1`: 默认稳定主版本, import path 不需要版本后缀;
- `v2+`: 主版本通常体现在 module path 中, 如 `/v2`;

### Semantic Versioning

- X.Y.Z: 主版本号.次版本号.修订版本号;
- major version: 不兼容变更, 如新增大功能、修改 API;
- minor version: 兼容功能新增, 如新增小功能、修复小问题;
- patch version: 兼容问题修复, 如修复小问题、优化性能;
