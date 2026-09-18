---
id: 07de2050-7744-4423-891a-c65785ed862d
---

# 二进制数据与 Blob

## Blob 与 File 表示什么？

- `Blob`: 二进制大对象, 由 `new Blob(blobParts, options)` 创建, 可指定 MIME 类型;
- `File`: Blob 的封装, 专注文件, 额外带文件名与最后修改时间;

```js
const blob = new Blob([JSON.stringify({ hello: "world" })], { type: "application/json" });
const file = new File(["foo"], "foo.txt", { type: "text/plain" });
```

| Blob 成员                 | 作用                  |
| ------------------------- | --------------------- |
| `size` / `type`           | 字节大小 / MIME 类型  |
| `slice(start, end, type)` | 截取子集              |
| `text()`                  | 读取为字符串          |
| `arrayBuffer()`           | 读取为 `ArrayBuffer`  |
| `bytes()`                 | 字节迭代器            |
| `stream()`                | 返回 `ReadableStream` |

## FileReader 如何异步读取文件？

```js
const reader = new FileReader();
reader.readAsArrayBuffer(file);
reader.abort(); // 中止, 触发 abort 事件
reader.addEventListener("progress", () => {}); // 读取过程, 约每 50ms 触发
```

| 成员                                                            | 作用                                        |
| --------------------------------------------------------------- | ------------------------------------------- |
| `readAsArrayBuffer` / `readAsText` / `readAsDataURL`            | 按目标格式读取                              |
| `result` / `error` / `readyState`                               | 结果 / 错误 / 状态 (0 空, 1 读取中, 2 完成) |
| `onloadstart` / `onload` / `onprogress` / `onerror` / `onabort` | 开始读取 / 读取成功 / 读取中 / 出错 / 中止  |

## Object URL、Base64 与 Data URL 如何转换？

```js
const url = URL.createObjectURL(file);
img.src = url;
URL.revokeObjectURL(url); // 用完释放

btoa("plain"); // 编码为 base64
atob("cGxhaW4="); // 解码
const dataUrl = reader.readAsDataURL(blob); // 也可用 canvas.toDataURL()
```

- Data URL 格式: `data:[<mediatype>][;base64],<data>`;
- 转换路径:
  - `Data URL ⇄ atob/btoa ⇄ base64 ⇄ 二进制字符串 ⇄ TypedArray ⇄ ArrayBuffer ⇄ TextDecoder/Encoder ⇄ 文本`;
  - `ArrayBuffer/文本 ⇄ Blob → File → FileReader → Data URL/ArrayBuffer/文本`;
  - `TypedArray ⇄ ArrayBuffer ⇄ Blob/File → Object URL`;

```js
// canvas 转 png 后作为文件上传
const urlData = canvas.toDataURL();
const base = atob(urlData.substring(urlData.indexOf(",") + 1));
const bytes = Uint8Array.from(base, (ch) => ch.charCodeAt(0));
const file = new File([bytes], "logo.png", { type: "image/png" });
```

## 大文件如何分片上传与断点续传？

- 分片: 按规则切分文件, 每个分片带唯一标识;
- 传输: 串行或并行发送分片, 全部完成后服务端按 md5 校验完整性并合并;
- 首片: 附带整个文件的 md5, 且分片尽量小;
- 断点续传: 客户端上报分片信息, 服务端保存临时文件并记录进度; 断线重连后服务端返回缺失分片, 客户端继续发送剩余部分;
