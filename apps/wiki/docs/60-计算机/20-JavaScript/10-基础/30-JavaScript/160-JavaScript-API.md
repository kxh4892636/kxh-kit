---
id: 1a8bbacf-f353-47b3-90ac-b07cb9fccd25
---

# JavaScript API

## PostMessage

- 同源;
- 跨 window 通信;

##### PostMessage API

- Window.prototype.postMessage(message: any, targetOrigin: string, transfer?: Transferable[]): void 实例方法: 发送消息至目标窗口, targetOrigin 为目标窗口源;
- Window.prototype.addEventListener("message", (event: MessageEvent) => void): void 实例方法: 监听跨上下文消息事件;
- MessageEvent.prototype.origin: string 实例属性: 发送者的源;
- MessageEvent.prototype.data: any 实例属性: 消息内容;
- MessageEvent.prototype.source: WindowProxy | null 实例属性: 发送者的 window 对象代理;

```typescript
// 发送消息
let iframeWindow = document.getElementById("myframe").contentWindow;
iframeWindow.postMessage("A secret", "http://www.wrox.com");
// 接收消息
window.addEventListener("message", (event) => {
  if (event.origin == "http://www.wrox.com") {
    processMessage(event.data);
    event.source.postMessage("Received!", "http://p2p.wrox.com");
  }
});
```

## 二进制数据 API

### Blob

- 二进制大对象;

##### Blob API

- Blob(blobParts?: BlobPart[], options?: BlobPropertyBag): Blob 构造函数: 创建二进制大对象;
  - blobParts: 二进制数据数组, 可为 ArrayBuffer, ArrayBufferView, Blob, String...
  - options: 二进制数据选项, 可为 { type: MIME 类型 };
- Blob.prototype.size: number 实例属性: Blob 的字节大小;
- Blob.prototype.type: string 实例属性: Blob 的 MIME 类型;
- Blob.prototype.arrayBuffer(): Promise<ArrayBuffer> 实例方法: 返回 ArrayBuffer 格式的 Blob 内容;
- Blob.prototype.bytes(): AsyncIterable<number> 实例方法: 返回字节迭代器;
- Blob.prototype.slice(start?: number, end?: number, contentType?: string): Blob 实例方法: 返回 Blob 的子集;
- Blob.prototype.stream(): ReadableStream 实例方法: 返回 ReadableStream;
- Blob.prototype.text(): Promise<string> 实例方法: 返回字符串格式的 Blob 内容;

```typescript
const obj = { hello: "world" };
const blob = new Blob([JSON.stringify(obj, null, 2)], {
  type: "application/json",
});

const slice = blob.slice(0, 3);
```

### File

- Blob 的封装;
- 专注于文件操作;

#### File API

- new File(fileBits, fileName, options): File 构造函数: 创建文件对象;
  - fileBits: 文件内容数组, 可为 ArrayBuffer, ArrayBufferView, Blob, String...
  - fileName: 文件名;
  - options: 文件选项, 可为 { type: MIME 类型, lastModified: 最后修改时间 };

```typescript
var file = new File(["foo"], "foo.txt", {
  type: "text/plain",
});
```

### FileReader

- 异步读取 Blob/File;
- 创建 FileReader 对象;

##### FileReader API

- FileReader(): FileReader 构造函数: 异步读取 Blob/File;
- FileReader.prototype.error: DOMException | null 实例属性: 读取错误时存储错误信息;
- FileReader.prototype.readyState: number 实例属性: 读取状态 (0=EMPTY, 1=LOADING, 2=DONE);
- FileReader.prototype.result: string | ArrayBuffer | null 实例属性: 读取结果;
- FileReader.prototype.abort(): void 实例方法: 中止读取操作;
- FileReader.prototype.readAsArrayBuffer(blob: Blob): void 实例方法: 将 Blob 读取为 ArrayBuffer;
- FileReader.prototype.readAsDataURL(blob: Blob): void 实例方法: 将 Blob 读取为 Data URL;
- FileReader.prototype.readAsText(blob: Blob, encoding?: string): void 实例方法: 将 Blob 读取为文本;
- FileReader.prototype.onabort: ((this: FileReader, ev: Event) => void) | null 实例属性: 中止读取时触发;
- FileReader.prototype.onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => void) | null 实例属性: 读取错误时触发;
- FileReader.prototype.onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => void) | null 实例属性: 读取成功时触发;
- FileReader.prototype.onloadstart: ((this: FileReader, ev: ProgressEvent<FileReader>) => void) | null 实例属性: 开始读取时触发;
- FileReader.prototype.onprogress: ((this: FileReader, ev: ProgressEvent<FileReader>) => void) | null 实例属性: 读取过程中触发 (每 50ms);

```typescript
const reader = new FileReader();
// 读取文件为 arraybuffer
reader.readAsArrayBuffer(file);
const content = reader.result;
// 停止读取文件
reader.abort(); // 触发 abort 事件
// 监听 progress 事件
reader.addEventListener(
  "progress",
  () => {
    //...
  },
  false,
);
```

### Object URL

- 使用 text, base64...编码 Blob 对象;

##### Object URL API

- window.URL.createObjectURL(blob): 接受一个 File 或 Blob 对象;
- window.URL.revokeObjectURL(url): 释放一个之前创建的 Object URL;

```typescript
url = window.URL.createObjectURL(file);
img.src = url;
window.URL.revokeObjectURL(url);
```

### Base64 编码

- 基于 64 个可打印字符来表示二进制数据;

##### Base64 API

- window.atob(base64String): string 全局方法: 将 base64 编码字符串解码为普通字符串;
- window.btoa(string): string 全局方法: 将普通字符串编码为 base64 字符串;

### Data Url

- 数据 URL 是一种特殊的 URL, 使用 Base64 编码表示数据;
- 格式: data:[<mediatype>][;base64],<data>;

##### Data Url API

- FileReader.prototype.readAsDataURL(blob: Blob): void 实例方法: 将 Blob 读取为 Data URL;
- HTMLCanvasElement.prototype.toDataURL(type?: string, quality?: number): string 实例方法: 将 Canvas 内容转换为 Data URL;

## 原生拖放

### 拖放事件

##### 拖动触发顺序

- 触发元素为拖动元素;
- dragstart, drag, dragend 依次触发;
- 开始移动鼠标瞬间触发 dragstart 事件;
- 拖动鼠标持续触发 drag;
- 停止移动触发 dragend 事件;

##### 放置触发顺序

- 触发元素为目标放置元素;
- dragenter, dragover, drop/dragleave 依次触发;
- 移动到放置目标上触发 dragenter 事件;
- dragenter 触发后, 拖动元素只要在放置元素范围内持续触发 dragover 事件;
- 离开放置元素范围触发 dragleave 事件;
- 放置到目标元素后触发 drop 事件;

### DataTransfer

- 暴露于拖放回调中 event 属性;
- 用于被拖动元素向放置目标传递字符串数据;

##### DataTransfer API

- DataTransfer.prototype.dropEffect: "none" | "copy" | "link" | "move" 实例属性: 放置效果类型;
- DataTransfer.prototype.effectAllowed: "none" | "copy" | "copyLink" | "copyMove" | "link" | "linkMove" | "move" | "all" | "uninitialized" 实例属性: 允许的拖动效果;
- DataTransfer.prototype.files: FileList 实例属性: 拖动的文件列表;
- DataTransfer.prototype.items: DataTransferItemList 实例属性: 拖动的数据项列表;
- DataTransfer.prototype.types: string[] 实例属性: 拖动数据的类型列表;
- DataTransfer.prototype.clearData(format?: string): void 实例方法: 清除指定格式的数据;
- DataTransfer.prototype.getData(format: string): string 实例方法: 获取指定格式的数据;
- DataTransfer.prototype.setData(format: string, data: string): void 实例方法: 设置指定格式的数据;
- DataTransfer.prototype.setDragImage(image: Element, xOffset: number, yOffset: number): void 实例方法: 设置自定义拖动图像;

### 可拖动能力

##### 可拖动能力

- 图片, 链接和文本默认可拖动;
- 可使用 draggable 设置任意元素可拖动;

```html
<!-- 禁止拖动图片 -->
<img src="smile.gif" draggable="false" alt="Smiley face" />
<!-- 让元素可以拖动 -->
<div draggable="true">...</div>
```

##### 强制放置

- 部分元素不支持放置, 可通过覆盖 dragover 和 dragenter 默认行为将任何标签转换为可放置目标;

```typescript
let droptarget = document.getElementById("droptarget");
droptarget.addEventListener("dragover", (event) => {
  event.preventDefault();
});
droptarget.addEventListener("dragenter", (event) => {
  event.preventDefault();
});
```

## Notifications

##### Notifications API

- Notification(title: string, options?: NotificationOptions): Notification 构造函数: 创建并显示通知;
- Notification.prototype.close(): void 实例方法: 隐藏通知;
- Notification.prototype.onshow: ((this: Notification, ev: Event) => void) | null 实例属性: 显示通知时触发;
- Notification.prototype.onclick: ((this: Notification, ev: Event) => void) | null 实例属性: 点击通知时触发;
- Notification.prototype.onclose: ((this: Notification, ev: Event) => void) | null 实例属性: 关闭通知时触发;
- Notification.prototype.onerror: ((this: Notification, ev: Event) => void) | null 实例属性: 通知错误时触发;

```typescript
const n = new Notification("Title text!");
setTimeout(() => n.close(), 1000);

n.onshow = () => console.log("Notification was shown!");
n.onclose = () => console.log("Notification was closed!");
```

##### 通知权限

- 只能在安全上下文触发;
- 每个源必须得到用户允许;
- 权限请求每个域只能触发一次;
- Notification.requestPermission(): Promise<"granted" | "denied" | "default"> 实例方法: 返回当前源的通知权限;

```typescript
Notification.requestPermission().then((permission) => {
  console.log("User responded to permission request:", permission);
});
```

## Page Visibility

##### Page Visibility API

- Document.prototype.visibilityState: "visible" | "hidden" | "prerender" | "unloaded" 实例属性: 页面当前状态;
- Document.prototype.hidden: boolean 实例属性: 页面是否隐藏;
- Document.prototype.addEventListener("visibilitychange", (event: Event) => void): void 实例方法: 监听页面可见性变化事件;

```typescript
const visibilityState = document.visibilityState;
document.addEventListener("visibilitychange", () => {
  // ...
});
```

## Performance

### Performance

- 当前页面的性能信息, 高精度数据;

### Performance API

- Performance.prototype.now(): number 实例方法: 返回微秒级别的浮点值, 从执行上下文创建计时;
- Performance.prototype.timeOrigin: number 实例属性: 执行上下文创建的基准值;
- Performance.prototype.eventCounts: EventCounts 实例属性: 事件计数器;
- Performance.prototype.navigation: PerformanceNavigation 实例属性: 导航性能信息;
- Performance.prototype.timing: PerformanceTiming 实例属性: 导航时间信息;
- Performance.prototype.clearMarks(markName?: string): void 实例方法: 清除指定标记;
- Performance.prototype.clearMeasures(measureName?: string): void 实例方法: 清除指定测量;
- Performance.prototype.clearResourceTimings(): void 实例方法: 清除资源时间;
- Performance.prototype.getEntries(): PerformanceEntryList 实例方法: 获取所有性能条目;
- Performance.prototype.getEntriesByName(name: string, entryType?: string): PerformanceEntryList 实例方法: 根据名称获取性能条目;
- Performance.prototype.getEntriesByType(type: string): PerformanceEntryList 实例方法: 根据类型获取性能条目;
- Performance.prototype.mark(markName: string): PerformanceMark 实例方法: 创建标记;
- Performance.prototype.measure(measureName: string, startMark?: string, endMark?: string): PerformanceMeasure 实例方法: 创建测量;
- Performance.prototype.setResourceTimingBufferSize(maxSize: number): void 实例方法: 设置资源时间缓冲区大小;
- Performance.prototype.toJSON(): any 实例方法: 返回 JSON 格式的性能数据;
- PerformanceEntry.prototype.name: string 实例属性: 性能条目名称;
- PerformanceEntry.prototype.entryType: string 实例属性: 性能条目类型;
- PerformanceEntry.prototype.startTime: number 实例属性: 性能条目开始时间;
- PerformanceEntry.prototype.duration: number 实例属性: 性能条目持续时间;

## Web Cryptography

### 随机数 API

- Crypto.prototype.getRandomValues<T extends Uint8Array | Uint16Array | Uint32Array | Int8Array | Int16Array | Int32Array | Float32Array | Float64Array>(array: T): T 实例方法: 生成指定类型数组对应位数的随机数;
- Crypto.prototype.randomUUID(): string 实例方法: 生成 UUID;

```typescript
const array = new Uint8Array(1);
const fooArray = new Uint32Array(1);
for (let i = 0; i < 5; ++i) {
  console.log(crypto.getRandomValues(array)); // 产生 5 个 8 位随机数
  console.log(crypto.getRandomValues(fooArray)); // 产生 5 个 32 位随机数
}

let uuid = crypto.randomUUID();
```

## 最佳实践

### 二进制数据的相互转换

- Data URL <=> [atob/btoa] <=> base64 <=> Binary String <=> [自己拼] <=> TypeArray <=> ArrayBuffer <=> [TextDecoder/Encoder] <=> Text;
- ArrayBuffer/Text <=> Blob => File => [FileReader] => Data URL/ArrayBuffer/Text;
- TypeArray <=> ArrayBuffer <=> Blob/File => Object URL;

### 大文件上传

##### 分片上传

- 根据一定规则, 将大文件分割成若干片;
- 客户端发送分片规则, 每个分片具有唯一标识;
- 串行或者并行发送各分片;
- 所有分片发送完毕后, 服务端根据 md5 判断数据是否上传完整, 完整则合并分片为原始文件;

##### 第一个分片

- 第一个分片附带原始文件 md5, 用于服务器验证文件完整性检验;
- 第一个分片大小最好小;

##### 断点续传

- 客户端传送给服务器端分片信息;
- 服务器端接受分片, 保存为临时文件, 根据分片信息判断上传进度;
- 如果发生网络错误, 恢复连接后, 服务器端发送给客户端当前仍未发送的分片信息;
- 客户端继续发送剩余分片;
