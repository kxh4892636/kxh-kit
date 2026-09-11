---
id: 843cda8b-9451-4d94-8170-ac2bf6c981fd
---

# hz 与 Thrift IDL

## hz 如何把 IDL 变成 HTTP 工程？

- `hz`: Hertz 的命令行代码生成工具; 从 IDL 生成模型、路由、Handler 骨架和项目布局;
- IDL: HTTP API 的机器可读契约; 描述字段、方法、路径和参数来源;
- Thrift: 本手册的默认 IDL; 在 Hertz 中驱动 HTTP 代码生成，不改变 HTTP 传输;
- Protobuf: 已有 proto3 生态时可选; 核心仍是注解到 HTTP 的映射;

## 如何安装并固定 hz 工具？

```powershell
go install github.com/cloudwego/hertz/cmd/hz@v0.9.7
hz --version
```

- PATH: 确保 Go bin 目录已加入 PATH;
- 版本: 团队在工具清单或构建镜像中固定版本，避免生成结果漂移;
- 生成环境: 本机和 CI 使用相同的 `hz`、Thrift 编译依赖和 Go 版本;

## 如何初始化契约驱动项目？

```powershell
go mod init example.com/article-api
hz new -module example.com/article-api -idl idl/article.thrift
go mod edit -replace github.com/apache/thrift=github.com/apache/thrift@v0.13.0
go mod tidy
```

- `-module`: 必须和 `go.mod` module 一致;
- `-idl`: 指向入口 IDL; include 路径相对关系需要稳定;
- 生成结果: 先检查目录和 diff，再补充业务实现;

## 如何推进一次契约变更？

```text
修改 IDL → 兼容性审查 → hz update → 查看生成 diff
      → 实现 Service/Handler → 测试 → 提交 IDL 与生成代码
```

- IDL: 是接口契约，不是数据库模型;
- Handler: 骨架可重新生成，业务规则不应只存在于生成文件;
- 实践: 公共 API 变更需要评估旧客户端，不以“能够重新生成”代替兼容设计;

## 需要核对具体用法时查哪里？

- 官方入口: [hz 安装](https://github.com/cloudwego/cloudwego.github.io/blob/38744fc12990bb900765d0235c171a80c9fa2af9/content/zh/docs/hertz/tutorials/toolkit/install.md)、[hz 使用 (thrift)](https://github.com/cloudwego/cloudwego.github.io/blob/38744fc12990bb900765d0235c171a80c9fa2af9/content/zh/docs/hertz/tutorials/toolkit/usage-thrift.md);
