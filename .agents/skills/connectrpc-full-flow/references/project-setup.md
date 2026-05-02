# 项目结构与前置依赖

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

核心概念：

- **proto/** 是唯一真实源——所有类型定义的起点
- **gen/** 是只读产物——永远不要手动编辑
- **internal/service/** 是后端唯一手写代码的地方
- **hooks/** 是前端业务逻辑层

## 前置依赖

### Go 后端

- Go 1.23+
- `$HOME/go/bin` 在 PATH 中
- `generate.sh` 首次运行自动安装 `protoc-gen-go`、`protoc-gen-connect-go`、`buf`

### TypeScript 前端

- Node.js 22+
- 运行时依赖：`@connectrpc/connect`、`@connectrpc/connect-web`、`@connectrpc/connect-query`、`@bufbuild/protobuf`
- 代码生成 CLI（`@scope/connectrpc-gen`）封装了生成工具，前端只需安装这一个包：

```bash
<pm> add -D @scope/connectrpc-gen
```

在 `package.json` 添加脚本：

```json
{ "scripts": { "gen:api": "connectrpc-gen" } }
```

使用：`<pm> run gen:api <project-name>` → CLI 读取 `connectrpc.config.json` → 生成到 `src/api/gen/<project-name>/`。
