import { mkdir, writeFile, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { readJson, runRoot, model, effort, writeJson } from "./model-call.mjs";

const percent = (value) => (value === null ? "—" : `${(value * 100).toFixed(2)}%`);
const categoryRows = (metrics, names) =>
  Object.entries(metrics)
    .map(([name, item]) => `| ${names[name] ?? name} | ${item.count} | ${percent(item.mean)} |`)
    .join("\n");

const memoryStatistics = async () => {
  const groups = (await readdir(resolve(runRoot, "sqlite"))).filter((name) =>
    /^(locomo-\d+|lme-web|lme-enterprise)$/u.test(name),
  );
  const rows = groups.map((group) => {
    const database = new DatabaseSync(resolve(runRoot, "sqlite", group, "nano-mem.db"), {
      readOnly: true,
    });
    try {
      return {
        group,
        count: database.prepare("SELECT COUNT(*) AS count FROM memories").get().count,
      };
    } finally {
      database.close();
    }
  });
  await writeJson(resolve(runRoot, "memory-statistics.json"), rows);
  return rows;
};

const evidenceDiagnostics = async () => {
  const questions = await readJson(resolve(runRoot, "locomo-questions.json"));
  const scored = (await readJson(resolve(runRoot, "locomo-scores.json"))).rows;
  const result = {
    questionsWithEvidence: 0,
    meanEvidenceIdRecall: 0,
    allEvidenceIdsRetrieved: 0,
    emptyRetrieval: 0,
  };
  const failures = [];
  for (const question of questions) {
    const prediction = await readJson(resolve(runRoot, "predictions", `${question.id}.json`));
    if (!prediction.retrieved.length) result.emptyRetrieval++;
    if (!question.evidence?.length) continue;
    const references = new Set(
      prediction.retrieved.flatMap((item) => item.source?.match(/D\d+:\d+/gu) ?? []),
    );
    const recall =
      question.evidence.filter((id) => references.has(id)).length / question.evidence.length;
    result.questionsWithEvidence++;
    result.meanEvidenceIdRecall += recall;
    if (recall === 1) result.allEvidenceIdsRetrieved++;
    const score = scored.find((item) => item.id === question.id)?.score;
    if (score < 0.5 && failures.length < 15)
      failures.push({
        id: question.id,
        question: question.question,
        expected: question.answer,
        prediction: prediction.prediction,
        score,
        evidenceIdRecall: recall,
        queries: prediction.queries,
      });
  }
  result.meanEvidenceIdRecall /= result.questionsWithEvidence || 1;
  return {
    ...result,
    interpretation:
      "Coverage of annotated evidence IDs in model-attributed memory sources; not semantic evidence correctness or causal failure attribution",
    failureExamples: failures,
  };
};

try {
  if ((await readJson(resolve(runRoot, "run-status.json"))).state !== "complete")
    throw new Error("The evaluation runner has not completed");
  const locomo = await readJson(resolve(runRoot, "locomo-scores.json"));
  const lme = await readJson(resolve(runRoot, "lme-scores.json"));
  if (locomo.scored !== locomo.expected || lme.scored !== lme.expected)
    throw new Error("Full benchmark scoring is incomplete");
  const manifest = await readJson(resolve(runRoot, "manifest.json"));
  const usage = await readJson(resolve(runRoot, "usage-summary.json"));
  const diagnostics = await evidenceDiagnostics();
  await writeJson(resolve(runRoot, "diagnostics.json"), diagnostics);
  const calls = Object.entries(usage.stages).filter(([stage]) => stage !== "probe");
  const totals = calls.reduce(
    (sum, [, value]) => ({
      input: sum.input + value.inputTokens,
      output: sum.output + value.outputTokens,
      cached: sum.cached + value.cachedInputTokens,
    }),
    { input: 0, output: 0, cached: 0 },
  );
  const databaseGroups = await memoryStatistics();
  const report = `# Nano Mem 评测：${model} / ${effort}

运行日期：2026-09-05。LoCoMo ${locomo.scored}/${locomo.expected} 题、LongMemEval-V2 small ${lme.scored}/${lme.expected} 题全部完成评分。

| 基准与指标 | 结果 |
| --- | --- |
| LoCoMo 可回答题，原版 F1 | ${percent(locomo.answerable_f1)} |
| LoCoMo 不可回答题，原版准确率 | ${percent(locomo.adversarial_accuracy)} |
| LongMemEval-V2 small，准确率 | ${percent(lme.accuracy)} |

## LoCoMo 分类

| 类别 | 题数 | 分数 |
| --- | --- | --- |
${categoryRows(locomo.by_category, { 1: "多跳 F1", 2: "时间 F1", 3: "开放域 F1", 4: "单跳 F1", 5: "不可回答题准确率" })}

## LongMemEval-V2 分类

| 类别 | 题数 | 准确率 |
| --- | --- | --- |
${categoryRows(lme.by_category, {})}

| 领域 | 题数 | 准确率 |
| --- | --- | --- |
${categoryRows(lme.by_domain, {})}

## 调用和记忆

模型的记忆提炼、查询规划、答题和必要裁判均使用 ${model} / ${effort}。输入 token 共 ${totals.input.toLocaleString("en-US")}，其中缓存输入 ${totals.cached.toLocaleString("en-US")}；输出 token 共 ${totals.output.toLocaleString("en-US")}，包含推理 token。以上是已保留 usage 的调用之和，包含归档的重跑前调用；失败、中断和并发覆盖前未保留记录的用量未知，实际消耗可能更高。通过现有 ChatGPT 登录调用，未获得 API 账单，美元费用不作估算。

本次使用 ${databaseGroups.length} 个独立 SQLite 数据库，全部位于实验目录的 sqlite 子目录；查询只读。现有日常记忆数据库不参与实验。

| 数据库组 | 记忆条数 |
| --- | --- |
${databaseGroups.map(({ group, count }) => `| ${group} | ${count} |`).join("\n")}

LoCoMo 检索结果中标注证据 ID 的平均覆盖率为 ${percent(diagnostics.meanEvidenceIdRecall)}。这是模型记录的来源 ID 覆盖率，不能替代记忆内容正确性判断。失败例子和查询词已保存到 diagnostics.json。

## 如何解读

在本协议下，多跳题和环境知识题仍有较大改进空间。LoCoMo 的每题检索结果均非空，但非空不代表相关；应分别核查提炼是否保留事实、检索是否返回所需事实，以及模型如何据此作答。

以下是逐题诊断中的具体例子：

| 题目 ID | 标准答案 | 模型答案 | F1 |
| --- | --- | --- | --- |
${diagnostics.failureExamples
  .filter((item) => ["locomo-0-q3", "locomo-0-q5", "locomo-0-q10"].includes(item.id))
  .map((item) => `| ${item.id} | ${item.expected} | ${item.prediction} | ${percent(item.score)} |`)
  .join("\n")}

最后一例也说明词面 F1 的限制：数字写法和附加日期会拉低分数，即使核心时长一致。因此 F1 不能直接当作事实正确率。下一轮宜固定本次配置，分别加入无记忆对照和原始证据检索对照，再测检索预算变化；本次结果本身无法把损失归因到某一个环节。

## 协议和适用范围

这是固定适配器下 Nano Mem 存储检索引擎与模型组合的成绩。历史独立提炼为最多 80 条/块的原子记忆，每题 1～3 次检索、每次前 5 条；不把原始历史交给答题模型。LoCoMo 使用原对话和公开图片说明；LME 使用全部选定轨迹文字和题目图片，不使用历史轨迹截图。

评分复用上游函数；LME 必要的模型裁判复用上游提示词，但裁判改为本次模型。不同模型、模态、预算和协议的榜单分数不可直接比较。没有无记忆对照组，因此不声明因果提升。本实验固定记忆生命周期状态，不评价完整 skill 的自主触发、语义去重、纠错和遗忘。

执行中 LME 尾部队列出现 22 题重叠。这些题目全部归档并由单个运行器统一重新执行，最终评分仅使用重跑答案；重跑集合由执行日志交集决定，与分数无关。详情见 concurrent-answer-overlap.json 和评测说明。

## 可复核证据

- Nano Mem commit：\`${manifest.revisions.nanoMem}\`
- LongMemEval-V2 代码：\`${manifest.revisions.longMemEvalV2}\`，数据：\`${manifest.revisions.lmeDataset}\`
- LoCoMo 代码和数据：\`${manifest.revisions.locomo}\`
- 实验目录：\`.cache/nano-mem-eval/runs/${model}-${effort}-v1/\`
- 逐题评分：\`locomo-scores.json\`、\`lme-scores.json\`
- 提示词、输出、usage：\`calls/\`；检索和答案：\`predictions/\`
- 运行协议：\`manifest.json\`；阶段状态：\`run-status.json\`
- 复现入口：[评测说明](../../../packages/nano-mem/benchmarks/README.md)

验证：上游 34 个已下载 LME 文件的 SHA-256 全部匹配；Nano Mem 原有 145 个测试通过；隔离、去重、只读写入拒绝、上游评分函数和脚本静态检查通过。
`;
  const reportPath = resolve("docs/nano-mem/evaluations/2026-09-05-luna-max.md");
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, report);
  console.log(reportPath);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
