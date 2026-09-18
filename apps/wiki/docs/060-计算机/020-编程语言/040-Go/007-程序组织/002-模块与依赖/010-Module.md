---
id: 21fd7a38-20f9-57eb-be76-6994decc9c13
---

# Module

## module 如何通过 go.mod 与 go.sum 描述身份和依赖？

- module: 一组共享同一 module path 的 Go package 集合;
- module path: 当前 module 被导入时使用的根路径;

| 文件     | 作用                                          |
| -------- | --------------------------------------------- |
| `go.mod` | 声明 module 身份、Go 版本与直接或间接依赖要求 |
| `go.sum` | 保存依赖内容的校验信息                        |

- 校验边界: `go.sum` 保存依赖模块及其 go.mod 内容的校验值，用于检测下载内容变化；它不是记录完整解析版本图的锁文件;

```text
module path: example.com/hello
包目录:      calc/
导入路径:    example.com/hello/calc
包声明:      package calc
```

## 如何创建模块？ go mod init 做了什么？

- 初始化: 在项目根目录执行 `go mod init <module path>`，创建 go.mod 并确定后续包导入路径的前缀;

```bash
mkdir hello
cd hello
go mod init example.com/hello # 创建 go.mod 并写入 module path
```

## go.mod 中 replace 的作用是什么？ 适用哪些场景？

- replace: 在主模块配置中把依赖的内容来源换成本地目录或其他模块版本，常用于联调与临时 fork；替换目标仍须符合预期模块布局;

```text
// 替换为本地目录;常用于本地联调或临时 fork
replace example.com/lib => ../lib
```

- 生效边界: `replace` 本身不添加依赖，仍需相应的 `require`；依赖模块自己的 replace 不会传递给主模块;
