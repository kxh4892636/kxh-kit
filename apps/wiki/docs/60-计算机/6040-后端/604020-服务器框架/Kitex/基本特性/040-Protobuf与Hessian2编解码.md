---
id: f3f0177b-8fe9-49af-a6bc-1f1469f78161
---

# Kitex Protobuf 与 Hessian2 编解码

## Protobuf

- 只支持 proto3; 必须定义 `go_package`（可只写包名，如 `pbdemo`）;
- 需要 protoc 在 PATH 中;
- 默认使用 Kitex-protobuf（fastpb 高性能编解码），不支持 streaming;
- IDL 含 streaming 方法时自动走 gRPC 协议;
- 无 streaming 方法但想用 gRPC: `client.WithTransportProtocol(transport.GRPC)`;

```shell
kitex -I idl/ idl/${idl_name}.proto
kitex -service ${service_name} -I idl/ idl/${idl_name}.proto
```

## Hessian2 / Dubbo 互通

- Hessian2 为二进制序列化协议，用于 Kitex 与 Dubbo 互通（非核心序列化）;
- IDL 类型为 thrift，生成时指定协议;

```shell
kitex -protocol Hessian2 -I idl/ idl/${idl_name}.thrift
```

```go
cli, err := service.NewClient(destService,
	client.WithCodec(dubbo.NewDubboCodec(dubbo.WithJavaClassName("JavaInterfaceName"))))
```

- 每个结构体需添加 `JavaClassName` 注解，值为对应 Java 类名;
- DubboCodec 兼容细节见 kitex-contrib/codec-dubbo;
