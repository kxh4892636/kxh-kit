# Nano Mem 低分诊断

基于 [原评测报告](2026-09-05-luna-max.md) 的逐题输出、独立 SQLite、原始输入和上游评分实现进行离线复核。没有重新调用答题模型，也没有修改原始预测或原口径评分。

## 1. 已量化：LME 答案格式与评分器不兼容

451 个答案中，170 个在 boxed 内容内使用了 LaTeX 文本包装。上游 `extract_boxed_answer` 保留 `\text{...}`，随后词面归一化会把 `\text{Class}` 变成 `textclass`，无法匹配标准答案 `Class`。这使内容正确的答案也可能得零分。

对全部答案统一去掉最外层 `\text{}`、`\mathrm{}` 或 `\textrm{}`，保持内部文字、原上游确定性评分函数和既有模型裁判结果不变：

| 口径               | 正确题数 | 准确率 |
| ------------------ | -------- | ------ |
| 原评分口径         | 89/451   | 19.73% |
| 外层格式归一化诊断 | 134/451  | 29.71% |

45 题从零分变为一分，差值为 9.98 个百分点；其中静态环境题 25 道、动态环境题 12 道、流程题 8 道。这是评分敏感性分析，不是新的官方口径成绩，也不代表这 45 题都经过独立人工语义评分。原报告未识别这一因素，不能把这部分分数损失归因于记忆能力。

证据：实验目录下 `format-sensitivity.json`；可复跑脚本 `.cache/nano-mem-eval/diagnose-format.py`。例题 `0f970f01` 的原始回答为 `\(\boxed{\text{Class}}\)`，标准答案就是 `Class`。

## 2. 已复现：正确记忆已存入，但词形不同导致检索遗漏

LoCoMo 题 `locomo-0-q3` 问 Caroline 研究了什么，标准答案为 Adoption agencies。数据库实际保存了：

> Caroline is researching adoption agencies because she dreams of having a family and giving a loving home to children who need one.

评测模型生成的查询是 `Caroline research`、`Caroline researched`、`Caroline study`，最终回答 career options。离线使用原引擎重新检索同一只读数据库发现：

| 查询                 | 上述正确记忆的名次 |
| -------------------- | ------------------ |
| Caroline research    | 前 50 条未出现     |
| Caroline researched  | 前 50 条未出现     |
| Caroline researching | 第 1 条            |

当前 tokenizer 不做英文词干化或词形还原，检索按词组匹配数分层，再按 BM25 和生命周期分数排序。词形失配会使查询退化到仅匹配人名，取回其他话题。本例确认了检索遗漏；尚未量化它占全部错误的比例。

证据：[tokenizer](../../../packages/nano-mem/src/memory/search-tokenizer.ts)、[检索实现](../../../packages/nano-mem/src/memory/memory-repository.ts)，以及原预测和 `locomo-0` 评测 SQLite。

## 3. 已观察：拒答与固定检索预算限制

LME 去除上述格式包装后，有 220/451 个答案为 UNKNOWN，约 48.78%；原解析只识别了其中 173 个。LoCoMo 的 1,540 道可回答题中，有 203 道回答 No information available，约 13.18%。拒答是结果表现，不能单凭拒答数量判断是没存、没检索到还是理解偏差。

本次每题只有一次查询规划，生成 1～3 条查询，每条前 5 条；没有根据首轮结果追问、补检索或回查原始历史。LME 每题平均取得 12.39 条记忆，LoCoMo 为 10.46 条。

具体例子：`locomo-0-q13` 已检索到 Caroline 考虑 counseling / mental health 的记忆，但记忆同时强调这是 aspiration、不是 confirmed career decision；题目却问已经决定的职业。模型因此拒答。这体现了提炼措辞、严格证据约束与题目预期之间的交互，不能简单判为检索故障。

证据：`failure-analysis-statistics.json`、`format-sensitivity.json` 和逐题预测。

## 4. 协议层面的可能因素：压缩与模态覆盖

LME 选定历史文字为 148,147,664 字符，提炼后记忆正文为 2,306,866 字符，约为原长度的 1.56%。大量原轨迹内容重复，因此这一比例不是事实保留率；但独立分块、优先选取少量事实的有损提炼，可能漏掉字段位置、精确名称、页面细节和条件关系。

历史截图没有导入，题目图片有导入。截图缺失可能影响部分题目，但本次尚无模态对照实验，不能量化影响。压缩、模态与检索预算都属于本次适配协议，不应直接当作 Nano Mem 存储引擎本身的缺陷。

## 5. 已确认的 LoCoMo 评分与标注限制

- `locomo-0-q10`：标准答案 `4 years`，预测 `Four years as of June 9, 2023.`，F1 仅 22.22%。核心时长一致，数字写法和额外词语影响了词面分数。
- `locomo-0-q5`：2023-05-25 原始会话明确说 last Saturday；预测为 Saturday, 20 May 2023，与原文一致。但标准答案写 The sunday before 25 May 2023。该题存在标注冲突，不能据此认定模型算错日期。原评分保留，未手工修订 gold。

以上是已确认的具体例子，不代表已审查全部标注。LoCoMo F1 43.52% 不能直接解释为事实正确率 43.52%。

## 后续验证顺序

先建立并分别报告原评分与格式归一化评分；然后在固定快照上测试词形归一化及检索预算，再比较带二次检索、原始证据回查的问答。配合无记忆和标准证据对照，才能进一步拆分提炼、检索与答题各自造成的损失。当前没有证据把低分主要归因于模型强度、SQLite 或遗忘机制；本次生命周期被固定，未触发遗忘。
