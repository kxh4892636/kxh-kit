# Nano Mem 公共基准评测

当前实验使用 `gpt-5.6-luna`，推理强度 `max`。模型调用通过本机已登录的 Codex CLI；每次调用都是独立的 ephemeral turn，关闭 shell、网页搜索和项目指令加载，禁止额外工具调用。程序检查输出事件，遇到工具调用直接报错。

实验目录：`.cache/nano-mem-eval/runs/gpt-5.6-luna-max-v1/`。目录中的 `manifest.json` 保存数据、代码版本和协议；`run-status.json` 保存执行状态。原始数据、提示词、模型输出和 SQLite 均留在被 Git 忽略的 `.cache` 中。

## 评测范围

| 基准           | 范围                                                  | 评分                                                                              |
| -------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| LongMemEval-V2 | 官方 small 档位，451 题，两个领域各 100 条轨迹        | 原仓库按题指定的评分函数；需要模型裁判时使用原裁判提示词和 Luna max               |
| LoCoMo         | `locomo10.json` 全集，10 组对话，272 个会话，1,986 题 | 原仓库的词干化 F1、多答案处理和不可回答题判定；问答 F1 与不可回答题准确率分开报告 |

这是固定导入和检索适配器下的 **Nano Mem 存储检索引擎 + Luna max** 评测。它不覆盖完整 skill 的自主触发、语义去重、纠错和遗忘流程，也不构成官方榜单复现。

## 固定协议

1. LoCoMo 只导入对话和公开图片说明，不使用数据集提供的总结、观察、问题、答案或证据标签。
2. LongMemEval-V2 导入 small haystack 中的全部轨迹文字：目标、结果、URL、操作、思考和 accessibility tree。历史轨迹截图不导入；题目图片交给查询规划和答题模型。
3. 历史文本按 180,000 字符分块，每块由模型提炼最多 80 条、每条最多 1,600 字符的独立记忆。输入完整覆盖所选文字；记忆提炼是有损压缩。
4. 每条记忆经 Nano Mem 原始 repository 实现写入 SQLite，使用它的完全重复检测。原始 TypeScript 被转译到缓存目录，不修改生产实现。SQLite 路径必须在本次实验的 `sqlite/` 下。
5. 每组对话或领域使用独立数据库。运行时钟固定为 `2026-09-05T00:00:00Z`，事件日期写在记忆内容中；ID 固定由作用域和内容生成，避免随机 ID 打破检索分数平局时影响复现。
6. 测试题只能在对应历史全部导入后回答。模型生成 1～3 条查询，每条调用 Nano Mem 检索前 5 条，按 ID 去重后最多得到 15 条记忆。答题时无法访问原始历史或标准答案。
7. 查询数据库通过 SQLite `readOnly` 和 `query_only` 双重限制；答题之间不执行 `use/update/forget`，避免题目顺序改变后续分数。因此本实验不评价生命周期算法。
8. 裁判单独运行，只有评分阶段可以看到标准答案。LoCoMo 使用确定性规则；LME 需要模型裁判的题使用同一模型的新会话，存在同模型裁判偏差。

## 环境和运行

需要本仓库依赖、Node 24、本机 `codex` 安装和登录、Python 3.11，以及 Python 包 `nltk numpy regex`。本次使用 Codex CLI 0.153.2。当前脚本面向 Windows，Python 位于 `.cache/nano-mem-eval/venv/Scripts/python.exe`。

下载上游仓库到 `.cache/nano-mem-eval/longmemeval-v2` 和 `.cache/nano-mem-eval/locomo`，固定版本分别为 `2cc8c540bdb87fe6761629b585e727e1c4704520` 和 `3eb6f2c585f5e1699204e3c3bdf7adc5c28cb376`。LME 数据版本已固定在下载脚本中。

在仓库根目录执行：

```powershell
node packages/nano-mem/benchmarks/download-data.mjs
node packages/nano-mem/benchmarks/prepare-sources.mjs locomo
node packages/nano-mem/benchmarks/prepare-sources.mjs lme
node packages/nano-mem/benchmarks/experiment-record.mjs manifest
node packages/nano-mem/benchmarks/full-evaluation.mjs
```

`full-evaluation.mjs` 同时推进两个基准，默认 LoCoMo 并发 8、LME 并发 24。实验目录中的 `runtime-options.json` 可通过 `concurrency` 下的 `locomo-answer` 等键覆盖阶段并发数；本次答题阶段均使用 24。每次模型调用最多尝试 3 次，每个阶段最多恢复 3 次。成功的模型调用和导入记录按提示词哈希持久化；恢复时复用成功结果。不要同时启动两个完整运行器写入同一实验目录。

解析 JSON 时允许外层 Markdown 代码围栏和 `\boxed{}` 包装。模型产生无效 JSON 时，使用同一模型单独修复 JSON 语法，并检查去除 JSON 语法符号和空白后的内容序列保持一致。原始输出与修复调用均保留；内容不一致则报错。

本次还使用四个预填充队列：LME 输入块 `[624,724)`、`[724,924)`、LME 问题 `[300,451)` 和 LoCoMo 问题 `[1486,1986)`，各并发 24；主队列随后复用已完成记录。各预填充队列与当时主队列正在处理的区间分开。区间为从零开始的半开区间，阶段命令的最后一个参数指定起始偏移。相应 job JSON 和日志保留在实验目录。

早期运行器曾将 WebSocket 转 HTTPS 的传输提示误判为工具调用。`experiment-record.mjs recover` 校验完整事件、提示词哈希和最终输出一致后，恢复原始已完成响应；不重新选择答案。无法恢复的延迟记为 `null`，不计入延迟均值。初始 manifest 保存在 `manifest-initial.json`，最终 manifest 记录修复后的脚本哈希。

LME 答题尾部的两个队列追平后，22 题出现重叠执行。待队列结束后，`experiment-record.mjs reconcile` 将所有日志交集题目的查询、答案、裁判和预测归档，再由单个运行器重新执行这些题目；重跑集合与分数无关。原阶段日志保存在 `initial-run-logs/`，旧调用在 `calls/superseded-*/`。最终报告使用重跑结果。并发覆盖前未保留的调用用量无法恢复，因此 token 统计是可核验记录之和，可能低于实际总消耗。后续复现应使用单个完整运行器。

也可单独执行某阶段：

```powershell
node packages/nano-mem/benchmarks/run-benchmark.mjs ingest locomo Infinity 8
node packages/nano-mem/benchmarks/run-benchmark.mjs answer locomo Infinity 8
node packages/nano-mem/benchmarks/run-benchmark.mjs ingest lme Infinity 24
node packages/nano-mem/benchmarks/run-benchmark.mjs answer lme Infinity 24
node packages/nano-mem/benchmarks/judge-answers.mjs 24
node packages/nano-mem/benchmarks/experiment-record.mjs summary
node packages/nano-mem/benchmarks/generate-report.mjs
```

模型由 `model-call.mjs` 中的 `model` 和 `effort` 决定，实验目录自动随配置分开。修改提示词或检索协议时必须使用新的运行目录版本，不能把既有导入记录当成新协议结果。

## 结果解释

只有分数文件中的 `scored == expected`，且运行状态完整完成，才能报告全量分数。部分结果用于诊断执行链路，不能代表完整基准。

`usage-summary.json` 分阶段记录调用次数、输入、缓存输入、输出和推理 token，以及调用延迟。Codex 的输出 token 包含推理 token，不能再次相加。调用使用 ChatGPT 登录，没有 API 账单，因此不报告推算的美元费用。失败调用的日志保留，但若调用没有返回 usage，其 token 用量未知。

两套基准覆盖范围、模型和指标不同，不能直接比较两者分数，也不能与其他模型、不同上下文预算的榜单数值直接比较。本实验没有无记忆对照组，因此不据此声明记忆带来的因果提升。

上游实现来源：[LongMemEval-V2](https://github.com/xiaowu0162/LongMemEval-V2)、[LoCoMo](https://github.com/snap-research/locomo)。
