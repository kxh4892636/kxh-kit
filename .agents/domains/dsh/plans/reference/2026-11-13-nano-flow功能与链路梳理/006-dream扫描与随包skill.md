---
name: '006-dream扫描与随包skill'
description: 'dream 记忆维护的触发与提示词结构、nano_flow_dream 的 scan/mark 与 v2 按会话游标、扫描算法与报告格式、随包 skill provider 的发现规则。'
status: completed
related_noted: ['004-文档校验与索引生成', '005-轨迹日志与上下文轮转', '007-宿主路由与面板设置链路']

---

# 006 dream 扫描与随包 skill

## 范围

`dream/prompt.md`（88 行）、`dream/tool.ts`（118）、`dream/scan.mjs`（395）、`skills.ts`（88）、`skills/**`。

## 触发

dream 不是定时器，而是宿主定时任务把 `prompts/dream.md` 全文投递到新建的 nano-flow 会话（游标在宿主的 `nano-flow-dream.json`，见下）。提示词自身规定：调 `nano_flow_dream` scan 拿输入，不自己扫 `log.jsonl`。

## 提示词结构（prompt.md）

| 段 | 内容 |
| --- | --- |
| 输入 | scan 拿清单；读清单里的 spec、note 结论段、域文档与 GUIDE；不与被维护 Plan 交互 |
| 怎么读轨迹 | `log.jsonl` 每行一条；禁止用 `read`（50 KB 上限），给一段 `bash + python3` 切片脚本，按 turn / session 过滤 |
| 知识归属 | 术语→CONTEXT、问题→questions、决策→adr、可复用活动→workflows；准入「有证据 + 会再用 + 不重复」 |
| 五个 pass | 纠错（写 `> 纠正（日期，来源）：…`，不改 note）→ 提炼 → 建链（`## 相关`）→ 晋升（只挑极少数进 GUIDE，整体重写）→ 剪枝 |
| 并行 | 多域时父会话只编排，每域一个 subagent，一次最多 4 个；子 agent 只写本域，不写 common/GUIDE/游标/生成物/spec/note，不 commit，不跑 check |
| 写入边界 | 可写 CONTEXT/questions/adr/workflows/GUIDE；只读 spec、note、全部生成物、system.md；游标只由 mark 写 |
| 门禁 | 父会话跑一次 `nano_flow_check` → 一次 `git commit`（`docs(dream): …`）→ commit 成功才 mark，失败不推进 |
| 退出 | 没有新增 turn 就说明后结束；有改动列出文件、结论与未处理项 |

## 工具（dream/tool.ts）

`nano_flow_dream({action, marks?, statePath?})`：

| action | 行为 |
| --- | --- |
| `scan` | `scanDreamInput({rootDir: workspace, domainsPath: domainRoot, statePath?})` → `formatReport` |
| `mark` | `statePath ?? defaultStatePath()`（`$DSH_HOME/toolkit/nano-flow-dream.json`）；找不到抛「找不到游标路径：宿主没有设置 DSH_HOME」；`marks` 逐项校验（planPath/sessionId 非空串、seq 非负有限数，空数组直接报错）；返回每个游标推进后的 lastSeq |

工具只是壳：扫描与游标口径都在 `scan.mjs`，同一份实现也能当 CLI 跑。

## 游标与扫描（scan.mjs）

状态文件 v2：

```json
{"version":2,"plans":{"<相对工作区的 Plan 目录>":{"sessions":{"<sessionId>":{"lastSeq":123,"updatedAt":"…"}}}}}
```

- 键是「Plan + 会话」：`log.jsonl` 里 turn 的 seq 来自宿主事件流，换会话会重新计数，Plan 级游标会漏轮次。
- `version !== 2`（含旧 v1）一律当空游标全量处理——产物幂等，重跑安全。
- 写文件用 `同名.pid.tmp` + rename。

扫描算法（`scanDreamInput`）：

1. `rootDir` 缺省 cwd，`domainsPath` 缺省 `.agents/domains`，两者都可为绝对路径。
2. 遍历域目录 → 三个生命周期 → Plan 目录；只有存在 `log.jsonl` 的 Plan 参与。
3. 逐行解析：`type: "session"` 是段头（不计数）；`type !== "turn"` 记一条 `unknown`（pi 的 `run` 就会落在这里）；缺 sessionId 或 seq 记 `invalidTurn`；坏行记 `malformed`。
4. 同一会话内只保留 `seq[1] > lastSeq` 的 turn；`latestSeq` 取该会话新 turn 的 seq 上界。
5. 分组结果：有新增的域 → `domains`；有 log 但无新增 → `idle`；有任何跳过记录 → `warnings`。

报告（`formatReport`）：工作区、游标路径（空/旧 v1 时说明按全量处理）、`## 有新增的域`（每 Plan 每会话「游标 lastSeq；新增 N 个 turn，seq 上界 X」，每个 turn 一行 80 字摘要 + 工具名，最多 30 条）、`## 需要留意`（坏行 / 非 turn 记录 / 无效 turn）、`## 无新增（只读）`、结尾给出 mark 用法。

`applyMarks`：`lastSeq = max(旧值, 新值)`（只前进），写 `updatedAt`，返回整份状态。CLI 侧另有 `--root/--domains/--state/--json/--mark "plan#session=seq"`，并用 realpath 判断「是不是被当脚本直接执行」，避免经 profile 软链调用时静默无输出。

## 随包 skill（skills.ts）

`createAssetSkillProvider(<资产>/skills)` 注册成宿主 provider：

- `name = "nano-flow-assets"`，`rank = 200`（数值小者优先，压过项目 `.agents/skills` 的 201，保证预设内的流程 skill 生效）。
- `list`：读目录（只看子目录、按名排序）→ 读每个 `SKILL.md` → `parseSkillText`（与 nested-skill 共用解析器）→ 产出 `{path,name,description,whenToUse?,invocation,source:"bundled",provider,resourceBase:{kind:"directory"},rank,locator,metadata?}`；解析不出或读不到就跳过。
- `get`：按 `locator.file` 重读再解析，返回去掉 rank/locator 的摘要 + 正文。
- 不写死名单：目录里加一个 skill 就多一个，删掉即消失；`signal.aborted` 时直接返回空。

当前六个：`code-spec`、`learning`（带 `ANKI.md`/`RULE.md`/脚本）、`ponytail-audit`、`ponytail-review`、`pp`、`to-skill`。带 `disable-model-invocation` 的只能手动调。

## 失败与降级

| 情形 | 行为 |
| --- | --- |
| `DSH_HOME` 缺失 | scan/mark 都抛「找不到游标路径」，工具不猜路径 |
| `log.jsonl` 不存在 | 该 Plan 不参与，不算 idle |
| 记录损坏 | 计数后跳过，不让一行坏数据打断整次 dream |
| skills 目录缺失 | provider 的 list 返回空，不报错 |

## 相关

- [004-文档校验与索引生成](./004-文档校验与索引生成.md) — dream 收尾的校验门禁
- [005-轨迹日志与上下文轮转](./005-轨迹日志与上下文轮转.md) — 被扫描的 log.jsonl 由谁写
- [007-宿主路由与面板设置链路](./007-宿主路由与面板设置链路.md) — 同一套 contract 里的游标与路由常量
