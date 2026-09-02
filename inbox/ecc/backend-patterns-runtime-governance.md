---
id: 7c97aa5e-f0d2-496a-874b-d1d49b072fdf
---

# Backend 运行治理模式

简单限流器怎样建模? 后台队列如何避免阻塞请求? 结构化日志需要哪些字段? backend-patterns 的 skill 元数据表达什么?

## Simple In-Memory Rate Limiter

- Rate limiter: 统计某个 identifier 在时间窗口内的请求次数, 超限返回 429;
- Identifier: 常用 IP、userId、API key; 选择错误会导致误伤或绕过;
- Window cleanup: 每次检查时删除窗口外时间戳, 只保留 recent requests;
- Scope: 内存限流只适合单进程或开发环境; 多实例生产环境应使用 Redis 等共享存储;

```typescript
interface RateLimiter {
  checkLimit(identifier: string, maxRequests: number, windowMs: number): Promise<boolean>;
}

function createRateLimiter(now: () => number): RateLimiter {
  const requests: Record<string, number[]> = {};
  return {
    async checkLimit(identifier, maxRequests, windowMs) {
      const current = now();
      const recent = (requests[identifier] ?? []).filter((time) => current - time < windowMs);
      if (recent.length >= maxRequests) return false;
      requests[identifier] = [...recent, current];
      return true;
    },
  };
}
```

## Simple Queue Pattern

- Queue: 请求只入队, 耗时任务异步处理, API 快速返回;
- Processing flag: 防止重复启动处理循环;
- Execute injection: 具体任务逻辑作为函数注入, 队列只管调度;
- Failure handling: 单个 job 失败只记录错误, 不阻塞后续 job;
- Example use: market indexing 可进入队列, endpoint 返回 `Job queued`;

```typescript
interface JobQueue<T> {
  add(job: T): Promise<void>;
}

function createJobQueue<T>(
  execute: (job: T) => Promise<void>,
  log: (error: unknown) => void,
): JobQueue<T> {
  const queue: T[] = [];
  let processing = false;
  async function process(): Promise<void> {
    processing = true;
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) continue;
      try {
        await execute(job);
      } catch (error) {
        log(error);
      }
    }
    processing = false;
  }
  return {
    async add(job) {
      queue.push(job);
      if (!processing) void process();
    },
  };
}
```

## Structured Logging

- Structured log: 日志是 JSON 事件, 包含 timestamp、level、message 和上下文;
- Context: `requestId`、`userId`、method、path 等字段让一次请求可追踪;
- Error log: 错误日志包含 message 与 stack, 对外响应仍使用泛化错误;
- Writer injection: 输出目标通过函数注入, 可替换为 console、文件、日志平台或测试 spy;

```typescript
interface LogContext {
  userId?: string;
  requestId?: string;
  method?: string;
  path?: string;
  [key: string]: unknown;
}

interface Logger {
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error: Error, context?: LogContext): void;
}

function createLogger(write: (entry: unknown) => void): Logger {
  const log = (level: "info" | "warn" | "error", message: string, context?: LogContext) => {
    write({ timestamp: Date.now(), level, message, ...context });
  };
  return {
    info: (message, context) => log("info", message, context),
    warn: (message, context) => log("warn", message, context),
    error: (message, error, context) =>
      log("error", message, { ...context, error: error.message, stack: error.stack }),
  };
}
```

## Skill Metadata

- Display name: `Backend Patterns`; 对用户展示的技能名称;
- Short description: `API, database, and server-side patterns`; 工具列表中的短说明;
- Brand color: `#F59E0B`; 界面识别色;
- Default prompt: `Use $backend-patterns to apply backend architecture and API patterns.`; 显式调用提示;
- Implicit invocation: `allow_implicit_invocation: true`; 符合场景时可自动启用;
- Remember: 后端模式服务于可扩展、可维护的服务端应用; 复杂度不足时不要强行套模式;
