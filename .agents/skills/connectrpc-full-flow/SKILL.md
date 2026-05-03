---
name: connectrpc-full-flow
description: ConnectRPC 全栈开发流程。涵盖 Go 后端 + TypeScript 前端 + Proto IDL 的完整工具链：环境配置、安装、项目结构、代码生成、接口实现、前端调用、开发工作流。当用户提到 ConnectRPC、proto、IDL、前后端类型安全、RPC、buf generate、connectrpc-gen、跨语言接口生成时触发。
---

# ConnectRPC 全栈开发

## 架构

```
.proto (IDL 唯一真实源)
  ├──► Go 后端  → generate.sh → gen/ → internal/ 实现
  ├──► TS 前端  → gen:api → src/api/gen/ → import 调用
  └──► API 文档 → generate.sh → docs/ → 静态 HTML 站点
```

前后端从同一 proto 生成代码，编译时保证类型安全。proto 可生成 API 文档站点（详见 `references/codegen.md`）。

## 开发工作流

```
1. 改 proto          <backend>/proto/**/*.proto
2. 生成后端代码和 API 文档       cd <backend> && ./generate.sh
3. 实现接口           internal/service/（详见 references/backend.md）
4. 生成前端代码       cd <frontend> && <pm> run gen:api <project-name>
5. 写业务 hook        hooks/（详见 references/frontend.md）
6. 重启验证           go run . + <pm> run dev
```

### 包管理器

通过项目根目录锁文件判断：`pnpm-lock.yaml` → pnpm，`package-lock.json` → npm，`yarn.lock` → yarn，`bun.lockb` → bun。操作时用对应命令，本文用 `<pm>` 代指。如有 monorepo 统一工具（如 vp）则优先使用。

## 代码生成

| 侧 | 命令 | 详情 |
|---|------|------|
| Go | `cd <backend> && ./generate.sh` | `references/codegen.md` |
| TS | `cd <frontend> && <pm> run gen:api <project-name>` | `references/codegen.md` |
| API 文档 | `cd <backend> && ./generate.sh` | `references/codegen.md` |

**gen/ 永远只读**，修改接口的流程是：改 proto → 重新生成 → 手写代码适配。

### 代码生成约束

当任务仅涉及 RPC 代码生成（如首次接入、proto 版本更新），**只需执行上述生成命令，不要探索或分析前后端项目结构**。proto 是唯一源，generate.sh / gen:api 会自行找到 proto 并产出 gen/，命令成功即意味着生成完成。只有编译报错或用户明确问及具体文件时才需要进一步查看代码。

## 关键原则

- proto 是唯一真实源，gen/ 是只读产物
- internal/service/ 是后端唯一手写代码的地方
- 前端 import 生成代码时编译期类型安全，proto 改前端会报错
- ConnectRPC URL 格式为 `/<package>.<Service>/<Method>`，三段由 proto 自动拼接

## 参考

- `references/codegen.md` — buf 配置、generate.sh、API 文档生成、CLI 实现细节
- `references/backend.md` — proto 编写、服务实现、main.go 注册
- `references/frontend.md` — Transport 配置、hook 写法、依赖说明
- `references/project-setup.md` — 项目结构、前置依赖、包管理器
