---
id: 64f3e503-3c7b-4fa0-bae4-e6845f4e0a67
---

# ArrayBuffer 与 TypedArray 视图

## ArrayBuffer 与视图是什么关系？

- `ArrayBuffer`: 定长连续内存区, `new ArrayBuffer(16)` 得到 16 字节并预填 0, 长度不可增减;
- 访问: 无索引器, `buffer[0]` 无效, 必须借助视图;
- 视图: 自身不存数据, 只给同一段字节一种解释, 如 `new Uint32Array(buffer)` 把 16 字节看成 4 个整数;

| 视图                                         | 单元素字节 | 含义                                |
| -------------------------------------------- | ---------- | ----------------------------------- |
| `Uint8Array` / `Uint16Array` / `Uint32Array` | 1 / 2 / 4  | 无符号整数                          |
| `Uint8ClampedArray`                          | 1          | 赋值越界时截到 0 或 255, 图像处理用 |
| `Int8Array` / `Int16Array` / `Int32Array`    | 1 / 2 / 4  | 有符号整数                          |
| `Float32Array` / `Float64Array`              | 4 / 8      | 浮点数                              |

- `TypedArray`: 以上视图的统称, 无同名构造函数, 共享 `map`/`slice`/`find`/`reduce` 等数组方法;
- 构造五式: `(buffer, [byteOffset], [length])` 建视图 / `(array)` 或 `(typedArray)` 复制并按需转换 / `(length)` 定长 / 无参得零长;
- 回指底层: `arr.buffer` / `arr.byteLength` / `TypedArray.BYTES_PER_ELEMENT`;
- 缺失方法: 无 `splice`/`concat`, 缓冲区定长, 删元素只能赋 0;
- `set(fromArr, [offset])`: 批量拷入; `subarray([begin, end])`: 建同类型新视图, 不拷贝;

## 同一段字节如何按不同格式读写？

- `DataView`: 无类型视图, 格式在调用方法时决定, 适合同一缓冲里存混合格式;
- 语法: `new DataView(buffer, [byteOffset], [byteLength])`, 必须自带 `ArrayBuffer`, 不会自动创建;
- 读写: `getUint8(offset)` / `getUint16(offset, [littleEndian])` / `setUint32(offset, value)` 等;
- 字节序: 多字节值默认按大端解释, `littleEndian` 传 `true` 时按小端;
- 越界写入: 不报错, 只留低位, 相当于存 `数值 mod 2^位数`; `Uint8Array` 写 256 得 0, 写 257 得 1;
- 术语: `ArrayBufferView` 泛指所有视图, `BufferSource` 泛指 `ArrayBuffer` 或其视图;

## 文本与字节如何互相转换？

- `TextDecoder`: 按编码把字节解成字符串, `new TextDecoder([label], [options])`;
  - `label`: 编码名, 默认 `utf-8`, 也支持 `big5`/`windows-1251` 等;
  - `fatal: true`: 非法字节抛异常, 默认替换为 `\uFFFD`;
  - `ignoreBOM: true`: 忽略 BOM 字节序标记, 极少用;
- `decoder.decode(input, [options])`: `input` 为 `BufferSource`;
- 流式: `{ stream: true }` 时解码器记住被块边界切断的多字节字符, 与下一块一起解;
- 只解一段: `uint8Array.subarray(1, -1)` 先建视图再 decode, 不复制数据;
- `TextEncoder`: 只支持 utf-8; `encode(str)` 返回 `Uint8Array`, `encodeInto(str, dest)` 写入已有 `Uint8Array`;
