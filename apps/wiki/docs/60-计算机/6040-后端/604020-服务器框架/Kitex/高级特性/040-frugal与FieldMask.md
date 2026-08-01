---
id: 2826a7b0-0292-48ca-942f-3acb06831e2e
---

# Kitex frugal 与 FieldMask

## Frugal 概述

- 基于 JIT 的高性能动态 Thrift 编解码器, 无需生成编解码代码;
- 多核场景性能最高可达传统编解码 5 倍左右;
- Server/Client 可独立使用; 传输数据仍为标准 thrift 协议;
- Server 开启 Frugal 时 Client 必须指定 Framed 或 TTHeaderFramed(需要 Payload Size);
- 不支持 ARM 架构(Mac M1/M2 可用 Rosetta);

## 启用方式

```shell
# 生成 frugal tag(Kitex >= v0.5.0 默认)
kitex -thrift frugal_tag -service service_name idl/api.thrift
# 激进版: slim 模板 + pretouch
kitex -thrift frugal_tag,template=slim -frugal-pretouch -service service_name idl/api.thrift
```

```go
codec := thrift.NewThriftCodecWithConfig(thrift.FrugalRead | thrift.FrugalWrite)
svr := echo.NewServer(new(EchoImpl), server.WithPayloadCodec(codec))
cli := echo.MustNewClient("a.b.c",
	client.WithPayloadCodec(codec),
	client.WithTransportProtocol(transport.Framed))
```

- frugal tag 强依赖: set 与 list 在 Go 中都是 slice, 靠 tag 区分;
- 无 frugal tag 时自动 fallback 到 Go 编解码(前提非 slim 模板);
- slim 模板不生成 Thrift 编解码 Go 源码, 无法 fallback, 只能报错;
- `-frugal-pretouch`: 在 init() 中预编译所有请求/响应类型, 减少首次请求耗时;
- 直接使用: `frugal.EncodeObject(buf, nil, data)` / `frugal.DecodeObject(buf, data)`, data 为 Args/Result 封装结构体;

## FieldMask

- 类似 Protobuf FieldMask: 指示关心的字段, 过滤无用数据, 减少传输开销;
- 场景: 隐私合规下发管控, 减少公共结构体冗余字段传输;
- 生成: `kitex -thrift with_field_mask -thrift with_reflection your_idl`;
- 构建: `fieldmask.NewFieldMask(TypeDescriptor, "$.A", "$.B")`, 路径语法 `$`, `.fieldname`, `[index]`, `{"key"}`, `{id}`, `*`;
- 默认白名单(掩码内字段通过), `Options{BlackListMode: true}` 可改黑名单;
- 应用: `resp.Set_FieldMask(fm)` 后 Kitex 序列化自动生效;
- 传递: 在请求中加 binary 字段携带 `fieldmask.Marshal/Unmarshal` 结果;
- 约定: 空 mask 全部通过; required 字段即使被过滤仍写入当前值(可用 `-thrift field_mask_zero_required` 改为零值); mask 必须从根对象生效;
- 构建开销高, 建议 init + sync.Map 缓存;
