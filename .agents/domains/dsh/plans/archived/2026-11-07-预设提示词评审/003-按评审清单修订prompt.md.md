---
name: '003-按评审清单修订prompt.md'
description: '把 note 01 的 P0/P1 清单落到 prompt.md，并同步 README 与 ask skill；构建安装后验证。'
status: completed
reason: ''
related_noted:
  - '001-评审prompt.md的优化空间'
next_step: ''
---

# 003-按评审清单修订prompt.md

> 迁移自旧 notes.json / story.md / spec.md；正文保留历史记录，旧工具、状态名与路径不再适用。

## 用户定案(2026-11-07)

除以下调整外, note 01 的评审意见全部落地:

- 忽略 3(域根冲突)与 20(Standards 措辞)。
- 6: Plan 创建时必须有一条 note, 拷问记录写进它。
- 7: ask / do 删除 `disable-model-invocation` 与 `agents/`, description 改成可被模型触发。
- 26: 改 L138 论述, 允许把不影响决策的轮次压成结论指针。
- 27: `packages/dsh-toolkit` 下所有 markdown 改用 ASCII 标点。

## 落地内容

- prompt.md: 模式优先级、何时建 Plan、四个锚点、合并读取清单、删空节与工具节、init 文案、index / description、已确认设计入 spec、去重、验收基线、ADR 判据、Workflow 由 `/kaizen` 沉淀、高置信门槛、同步四步、跨域输入、review 条件、拷问记录论述、模板合并。
- ask / do SKILL.md: 去掉 `disable-model-invocation`, 删 `agents/`, 改 description。
- README: 固定提示词描述与 ask / do 调用说明同步。
- runtime.test: ask / do invocation 断言改为 modelInvocable true。
- assets.lock.json: 重算 to-skill / code-spec / learning / kaizen 的哈希。

## 不做

- 域根规则(3)、Standards 措辞(20)。
- 工具语义与 check-domain 规则。
- 旧 Plan 迁移(02)。

## 执行检查点(2026-11-07)

- 已完成: 上述源码改动; 9 个 markdown 改为 ASCII 标点(字符级替换, 未额外补空格)。
- 验证: `vp test run src` 209 通过; `vp check --fix` 无告警; `pnpm build` 成功; dist/nano-flow 的 prompt.md 与 assets.lock.json 与 src 同哈希; dist 无中文标点; `nano_flow_check workspace` 通过。
- 已提交: `39eefc61 feat(dsh): 收敛 Nano Flow 提示词并开放 ask/do 触发`。
- 已安装: 打包 `kxh4892636-dsh-toolkit-0.4.1.tgz` 到仓库根; `dsh plugin --profile desktop remove` 后 `add`; 安装目录 `dist/nano-flow/prompt.md` 12,455 B, SHA-256 `8F544BD8...C1DA17` 与仓库 dist 一致; ask/do 无 `agents/` 与 `disable-model-invocation`; `dsh.profile.bundles` 仍含本包。
- 进行中会话的 skill 目录已刷新为新的 ask / do 描述。

## 待验证

- 新会话的固定提示词行为(模式优先级、Plan 初始化、无工具节等)。prompt 在会话创建时按文件读取, 新会话应自动生效; 重启宿主可确保。

## 下一步

1. 用户新开一个 Nano Flow 会话, 确认提示词与 ask / do 触发。
2. 通过后 complete 本 note; 未通过则记录差异并回到修订。

## 迁移前的证据
- 当前会话(2026-11-07 重启后)的系统提示词已是修订版: 含模式优先级、"何时建 Plan"、四个锚点, 不再有 "## 工具"
- 技能目录已出现 ask / do, 描述为新版场景触发文案
- 安装目录 dist/nano-flow/prompt.md 12,455 B, SHA-256 8F544BD8270113B733A6FAD924F4E5CD4456EF3132B2B421520ED6F403C1DA17, 与仓库 dist 一致; ask/do 无 agents 与 disable-model-invocation
