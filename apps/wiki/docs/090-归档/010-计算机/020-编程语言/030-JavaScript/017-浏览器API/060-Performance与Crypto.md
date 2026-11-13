---
id: dbf40033-8597-45d8-a102-568c71554392
---

# Performance 与 Crypto

## Performance 提供哪些时间与测量能力？

- 语义: 提供当前页面的高精度性能数据;
- 时间基准: `timeOrigin` 是计时原点, `now()` 返回相对原点的微秒级浮点值;

| 成员                                                           | 作用                             |
| -------------------------------------------------------------- | -------------------------------- |
| `now()`                                                        | 相对 `timeOrigin` 的高精度时间戳 |
| `timeOrigin`                                                   | 计时基准值                       |
| `mark(name)` / `measure(name, start?, end?)`                   | 打标记 / 计算两个标记之间的测量  |
| `clearMarks(name?)` / `clearMeasures(name?)`                   | 清除标记 / 测量                  |
| `getEntries()` / `getEntriesByName` / `getEntriesByType`       | 读取性能条目                     |
| `clearResourceTimings()` / `setResourceTimingBufferSize(size)` | 资源计时清理与缓冲设置           |
| `navigation` / `timing` / `eventCounts`                        | 导航信息 / 时间信息 / 事件计数   |
| `toJSON()`                                                     | 返回 JSON 形式的性能数据         |

- `PerformanceEntry`: 条目元数据, 含 `name`、`entryType`、`startTime`、`duration`;

```js
performance.mark("start");
await doSomething();
performance.mark("end");
performance.measure("task", "start", "end");
performance.getEntriesByName("task");
```

## Crypto 如何生成随机数？

| 成员                            | 作用                             |
| ------------------------------- | -------------------------------- |
| `crypto.getRandomValues(array)` | 用密码学安全随机数填充类型化数组 |
| `crypto.randomUUID()`           | 生成 UUID                        |

```js
const array = new Uint8Array(1);
crypto.getRandomValues(array); // 8 位随机数
crypto.getRandomValues(new Uint32Array(1)); // 32 位随机数
const uuid = crypto.randomUUID();
```

- 适用: 需要不可预测随机数时使用, 替代 `Math.random()`;
