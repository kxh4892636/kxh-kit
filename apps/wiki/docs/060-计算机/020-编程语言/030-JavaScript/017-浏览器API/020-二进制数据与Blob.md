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

## File 还能怎样获得, FileReader 有哪些补充？

- 直接构造: `new File(fileParts, fileName, { lastModified })`, `fileParts` 是 `Blob`/`BufferSource`/字符串数组;
- 常见来源: `<input type="file">` 与拖放, 元信息由操作系统提供, 因此额外带 `name` 与 `lastModified`;
- 多选: `input.files` 是类数组, 取 `input.files[0]`;
- 读任意 Blob: `FileReader` 不限于文件, 也可作为 `TextDecoder` 的替代;
- 事件补齐: `loadstart` → `progress` → `load`/`error`/`abort` → `loadend`, 最常用 `load` 与 `error`;
- `readAsText(blob, [encoding])`: 默认 `utf-8`;
- Web Worker 内可用同步版 `FileReaderSync`, `read*` 直接返回结果, 不触发事件;
- 免读取: `URL.createObjectURL(file)` 直接给 `<a>`/`<img>`; `fetch`/`XMLHttpRequest` 原生接受 `File`;

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

## 如何从画布得到 Blob, 大 Blob 为什么要用流？

- 构造注意: `blobParts` 必须是数组, 元素可为 `Blob`/`BufferSource`/字符串;
- `endings`: `"transparent"` 默认不动行尾, `"native"` 按当前系统转换;
- 不可变: 改不了内容, 只能 `slice` 出片段再拼新 Blob, 类似字符串;
- `type` 会成为请求的 `Content-Type`, 故 Blob 可直接上传/下载;

```js
context.drawImage(img, 0, 0); // 可先裁剪、旋转
canvas.toBlob((blob) => {}, "image/png"); // 异步回调拿 Blob
const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
```

- 超大 Blob (超 2 GB): `blob.arrayBuffer()` 很吃内存, 改用 `blob.stream()`;
- `stream()` 返回 `ReadableStream`, `getReader()` 后循环 `read()` 逐块拿 `{ done, value }`, `done` 为真即结束;
- 选型: `URL.createObjectURL(blob)` 更快、不编码, 但需 `revokeObjectURL` 释放; data URL 无需释放, 大 Blob 编码耗性能与内存;
