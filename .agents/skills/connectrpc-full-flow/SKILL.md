---
name: connectrpc-full-flow
description: ConnectRPC 全栈开发流程。涵盖 Go 后端 + TypeScript 前端 + Proto IDL 的完整工具链：环境配置、安装、项目结构、代码生成、接口实现、前端调用、开发工作流。当用户提到 ConnectRPC、proto、IDL、前后端类型安全、RPC、buf generate、connectrpc-gen、跨语言接口生成时触发。
---

# ConnectRPC 全栈开发流程

## 架构

```
.proto (IDL 唯一真实源)
  ├──► Go 后端  → generate.sh → gen/ → internal/ 实现
  └──► TS 前端  → gen:api → src/api/gen/ → import 调用
```

前后端从同一 proto 生成代码，编译时保证类型安全。

## 包管理器

通过项目根目录锁文件判断：`pnpm-lock.yaml` → pnpm，`package-lock.json` → npm，`yarn.lock` → yarn，`bun.lockb` → bun。操作时用对应命令，本文用 `<pm>` 代指。如有 monorepo 统一工具（如 vp）则优先使用。

## 项目结构（概念）

```
<repo-root>/
├── connectrpc.config.json            # 项目名 → 路径映射（用 CLI 时需要）
├── <backend>/                        # Go 后端
│   ├── proto/<domain>/v1/            # IDL 定义
│   ├── gen/                          # Go 生成代码（只读）
│   ├── internal/service/             # 业务实现
│   └── generate.sh                   # 代码生成脚本
└── <frontend>/                       # TS 前端
    └── src/
        ├── api/client.ts             # Transport 配置
        ├── api/gen/<backend-name>/   # TS 生成代码（只读）
        └── hooks/                    # 业务 hook
```

核心概念：proto 是唯一源，gen 是只读产物，internal 是唯一手写代码的地方。

## 前置依赖

**Go 后端**：Go 1.23+，`$HOME/go/bin` 在 PATH。`generate.sh` 首次运行自动安装 `protoc-gen-go`、`protoc-gen-connect-go`、`buf`。

**TS 前端**：Node.js 22+。运行时依赖 `@connectrpc/connect`、`@connectrpc/connect-web`、`@connectrpc/connect-query`、`@bufbuild/protobuf`。代码生成 CLI（`@scope/connectrpc-gen`）封装了生成工具，前端只需安装这一个包：

```bash
<pm> add -D @scope/connectrpc-gen
```

在 `package.json` 添加脚本：
```json
{ "scripts": { "gen:api": "connectrpc-gen" } }
```

使用：`<pm> run gen:api <project-name>` → CLI 读取 `connectrpc.config.json` → 生成到 `src/api/gen/<project-name>/`。

## 代码生成

**Go**：`cd <backend> && ./generate.sh`（详见 `references/codegen.md`）

**TS**：`cd <frontend> && <pm> run gen:api <project-name>`（详见 `references/codegen.md`）

**gen/ 永远只读**，修改接口的流程是：改 proto → 重新生成 → 手写代码适配。

## 开发工作流

```
1. 改 proto          <backend>/proto/**/*.proto
2. 生成后端代码       cd <backend> && ./generate.sh
3. 实现接口           internal/service/（详见 references/backend.md）
4. 生成前端代码       cd <frontend> && <pm> run gen:api <project-name>
5. 写业务 hook        hooks/（详见 references/frontend.md）
6. 重启验证           go run . + <pm> run dev
```

## 关键原则

- proto 是唯一真实源
- gen/ 只读，重新生成覆盖
- internal/service/ 是后端唯一手写代码的地方
- 前端 import 生成代码时编译期类型安全，proto 改前端会报错
- ConnectRPC URL 格式为 `/<package>.<Service>/<Method>`，三段由 proto 自动拼接

## 参考

- `references/codegen.md` — buf 配置、generate.sh、CLI 实现细节
- `references/backend.md` — proto 编写、服务实现、main.go 注册
- `references/frontend.md` — Transport 配置、hook 写法、依赖说明
