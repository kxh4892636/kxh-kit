---
status: completed
blocked_by: []
---

# CLI 骨架与 AnkiConnect 传输层

## 交付记录

- 实现: `packages/anki-cli`(commit 10869ec, 经 1b51cf7 合入 feature/anki-cli)
- 证据: 63 个 vitest 单测全绿(客户端串行化/重试/背压/只读守卫/错误分类 + utils + sync 命令端到端); `vp check` 0 错误 0 警告; `vp pack src/main.ts` 产出 dist/main.mjs, `node dist/main.mjs --help` 列出 sync, 离线错误路径退出码 1 且 stderr 输出 `{success:false,error,action,hint}`

## 交付

可执行的 `@kxh4892636/anki-cli` 包骨架：

- bin 入口 `anki-cli`（`src/main.ts`）与全局选项：`--anki-connect <url>`、`--read-only`、`--debug`、`--compact`；
- commander 分组子命令框架（`decks/notes/cards/models/tags/media/stats/gui/sync/review` 挂载点）与 `--help`；
- JSON 输出协议：stdout 结果 JSON（2 空格缩进，`--compact` 单行）；stderr 错误对象 `{success:false, error, action?, hint?, ...}`；退出码 0/1/2；
- 去 NestJS 的 `AnkiConnectClient`（ky + async-mutex）：串行化互斥、重试（408/413/429/5xx，限 2 次）、背压（MAX_QUEUE_DEPTH=50）、只读守卫（WRITE_ACTIONS）、错误分类（403/HTTP/fetch 连接/AnkiConnect error）；
- zod 配置（`config/`）：`ANKI_CONNECT_URL/API_KEY/API_VERSION/TIMEOUT`、`READ_ONLY`、`LOG_LEVEL`，与上游 env 同名同默认；
- 全部共享层移植：`types/anki.types.ts`（enum 改 const 对象 + 派生类型）、`utils/`（anki/card-states/deck-hierarchy/markdown/media-validation/stats 六个 utils）；
- 命令注册采用 `import.meta.glob` 自动发现（`commands/*/index.ts` 各导出 `registerCommand`），后续 issue 零共享文件改动；
- 一次性安装全部运行时依赖（commander、zod、ky、async-mutex、mime、ipaddr.js）并更新 lockfile；不引 remark/unified；
- tracer-bullet 命令 `anki-cli sync`：端到端证明「命令 → 客户端 → AnkiConnect → JSON 输出」全链路。

## 范围

做：上述骨架、客户端、配置、类型、utils 移植（含单测；`markdown.utils` 不移植）、sync 命令、全部运行时依赖。
不做：其余 47 条命令；交互式命令；README。

## 直接依赖

无（根 issue）。

## 验收

- [ ] `vp run @kxh4892636/anki-cli#test` 全绿：utils/client 单测 + 假 AnkiConnect HTTP 服务器集成测试（请求体 `{action,version,params}`、错误包装、重试、只读守卫、背压）；
- [ ] 假 AnkiConnect 在线时 `anki-cli sync` stdout 输出 success JSON、退出码 0；离线时 stderr 输出错误 JSON、退出码 1；
- [ ] `anki-cli --help` 与 `anki-cli decks --help` 可用；未知命令退出码 2；
- [ ] `--read-only` 下写 action（如 addNote）被守卫拦截并报错；
- [ ] `vp check`（format/lint/type）通过。

## 上下文

- 上游客户端：`.temp/anki-mcp-server/src/mcp/clients/anki-connect.client.ts`；
- 上游配置：`.temp/anki-mcp-server/src/config/config.schema.ts`；
- 上游 CLI 模式参考：`.temp/anki-mcp-server/src/cli/{args,cli-output,spinner}.ts`（仅参考，输出协议按本域 ADR-0001）；
- spec：../../2026-08-20-mcp迁移为cli/spec.md（实施决策节）。

## 下一步

/implement
