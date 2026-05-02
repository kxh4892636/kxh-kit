# 代码生成详解

## Go 后端生成

### 配置文件

`buf.yaml` 声明 proto 模块位置：
```yaml
version: v2
modules:
  - path: proto
```

`buf.gen.yaml` 配置 Go 代码生成：
```yaml
version: v2
plugins:
  - local: protoc-gen-go
    out: gen
    opt: [paths=source_relative]
  - local: protoc-gen-connect-go
    out: gen
    opt: [paths=source_relative]
```

### generate.sh

推荐在每个 Go 后端项目中放一个 `generate.sh`，首次运行自动安装所需工具：

```bash
#!/bin/bash
set -e
export PATH="$HOME/go/bin:$PATH"

install_if_missing() {
  if ! command -v "$1" &>/dev/null; then
    echo "Installing $2..."
    go install "$2@latest"
  fi
}

install_if_missing protoc-gen-go google.golang.org/protobuf/cmd/protoc-gen-go
install_if_missing protoc-gen-connect-go connectrpc.com/connect/cmd/protoc-gen-connect-go
install_if_missing buf github.com/bufbuild/buf/cmd/buf

echo "Generating Go code..."
buf generate
echo "Done."
```

运行 `./generate.sh` 即可。

产物：`gen/<package>/<version>/<service>.pb.go` + `<service>connect/<service>.connect.go`

### 手动运行

如果不用 generate.sh，手动执行：
```bash
cd <backend-dir>
buf generate
```
前提：`protoc-gen-go`、`protoc-gen-connect-go`、`buf` 已在 PATH 中（可通过 `go install` 安装）。

## TypeScript 前端生成

### 生成方式

两种方式：

| 方式 | 命令 | 适用场景 |
|------|------|---------|
| CLI 工具 | `<pm> run gen:api <project-name>` | 推荐，配置驱动 |
| 直接 buf | `buf generate --template buf.gen.ts.yaml` | 无 CLI 时的备选 |

### buf 配置

`buf.gen.ts.yaml`（由 CLI 动态生成，或手动维护）：
```yaml
version: v2
plugins:
  - local: protoc-gen-es
    out: <output-dir>
    opt: [target=ts, import_extension=.js]
  - local: protoc-gen-connect-query
    out: <output-dir>
    opt: [target=ts, import_extension=.js]
```

产物：`<output-dir>/<package>/<version>/<service>_pb.ts` + `<service>-<Service>_connectquery.ts`

### 生成代码是只读的

永远不要手动编辑 gen/ 下的文件。修改接口的流程是：
1. 改 proto
2. 重新运行 generate.sh / gen:api
3. 如果编译报错，说明手写代码需要适配新接口——这正是类型安全的价值
