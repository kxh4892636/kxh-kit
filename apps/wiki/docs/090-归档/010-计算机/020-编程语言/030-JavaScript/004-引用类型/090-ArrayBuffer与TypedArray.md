---
id: bcdd65fc-7f1e-4add-a5c1-da024bc3290a
---

# ArrayBuffer 与 TypedArray

## ArrayBuffer 表示什么？

- 语义: 一块按字节分配的内存, 是类型化数组与视图的底层载体;
- 特性: 创建后字节长度固定, 不能直接读写, 必须借助 `DataView` 或 `TypedArray`;

```js
const buf = new ArrayBuffer(16);
buf.byteLength; // 16
```

## DataView 如何按类型读写二进制？

- 能力: 在任意字节偏移处按指定类型读写, 适合解析自定义二进制协议;
- 元信息: `view.buffer`、`view.byteOffset`、`view.byteLength`;

```js
const buffer = new ArrayBuffer(2);
const view = new DataView(buffer, 0, buffer.length);
view.setUint8(0, 0x80);
view.getUint16(0); // 32769; 默认 big-endian
```

| 类型        | 取值范围                      | 字节 | 对应 C 类型 |
| ----------- | ----------------------------- | ---- | ----------- |
| `Int8`      | `-128` 到 `127`               | 1    | `int8_t`    |
| `Uint8`     | `0` 到 `255`                  | 1    | `uint8_t`   |
| `Int16`     | `-32768` 到 `32767`           | 2    | `int16_t`   |
| `Uint16`    | `0` 到 `65535`                | 2    | `uint16_t`  |
| `Int32`     | `-2147483648` 到 `2147483647` | 4    | `int32_t`   |
| `Uint32`    | `0` 到 `4294967295`           | 4    | `uint32_t`  |
| `Float32`   | 约 `1.2e-38` 到 `3.4e38`      | 4    | `float`     |
| `Float64`   | 约 `5e-324` 到 `1.8e308`      | 8    | `double`    |
| `BigInt64`  | `-2**63` 到 `2**63 - 1`       | 8    | `int64_t`   |
| `BigUint64` | `0` 到 `2**64 - 1`            | 8    | `uint64_t`  |

## 字节序会怎样影响读取结果？

- 基本单位: 以 1 字节 (8 位) 为存储单位;
- Big-Endian: 高位字节在前; Little-Endian: 低位字节在前;
- 读取: `getUint16(0)` 默认 big-endian, 传入 `true` 表示 little-endian;

```js
const buf = new ArrayBuffer(2);
const view = new DataView(buf);
view.setUint8(0, 0x80);
view.setUint8(1, 0x01);
view.getUint16(0); // 0x8001 = 32769
view.getUint16(0, true); // 0x0180 = 384
view.setUint16(0, 0x0002, true); // 按 little-endian 写入: 0x02 0x00
```

## TypedArray 如何创建与描述自身？

```js
const buf = new ArrayBuffer(12);
const ints = new Int32Array(buf); // 复用已有 buffer, 未初始化值为 0
Int16Array.from([3, 5, 7, 9]); // 从可迭代对象创建
Float32Array.of(3.14, 2.718, 1.618); // 按参数创建

ints.length; // 3; 元素数量
ints.buffer; // 对应的 ArrayBuffer
ints.byteLength; // 12; 字节长度
ints.BYTES_PER_ELEMENT; // 4; 单个元素字节数
```

## 写入超出类型范围的值会怎样？

- 位数截断: 写入值位数多于类型位数时, 从右向左截取对应位数;
- 范围回绕: 写入值超出类型取值范围时, 按补码语义转换成该类型可表示的值;
- 方法: 继承 `Array` 的多数方法, 但元素类型固定;
