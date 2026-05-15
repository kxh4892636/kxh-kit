# SOP 类型文档模板

当用户要求创建、改写或优化 SOP、接入手册、操作手册、平台使用手册、流程说明时使用本模板。第一章承担导航和速查，其余章节分别承载每条流程的具体操作。

## 固定结构

### 第一章：总览与速查

第一章不写具体操作细节，负责让读者快速理解术语、全局路径和问题入口。

```xml
<h1 seq="auto" seq-level="auto">总体说明与接入路径</h1>
<callout emoji="💡">
  <p><b>目标：</b>说明本文面向谁、解决什么问题、读者应该按什么顺序使用文档。</p>
</callout>
<h2 seq="auto" seq-level="auto">重要名词解释</h2>
<table>
  <thead><tr><th>名词</th><th>解释</th><th>示例或图示</th></tr></thead>
  <tbody>...</tbody>
</table>
<h2 seq="auto" seq-level="auto">总体流程</h2>
<table>
  <thead><tr><th>阶段</th><th>要做什么</th><th>产出</th></tr></thead>
  <tbody>...</tbody>
</table>
<h2 seq="auto" seq-level="auto">问题索引速查</h2>
<table>
  <thead><tr><th>问题</th><th>参考</th></tr></thead>
  <tbody>...</tbody>
</table>
```

第一章写作规则：

- `重要名词解释`：解释读者完成 SOP 必须理解的核心对象、平台、角色、产物，不收录泛泛概念。
- `总体流程`：用流程表或画板表达端到端路径，让读者知道应该先做什么、再做什么。
- `问题索引速查`：收集高频问题。参考列用列表分点表示：
  - `本文档：` 使用内部跳转链接，跳到对应章节或具体提示块；
  - `引用文档：` 使用飞书 cite 或原始链接。
- 第一章可以复用源文档图片、画板、看板作为总览，但不要堆具体步骤截图。

### 其余章节：每个流程一个章节

从第二章开始，每个一级标题对应一个独立流程、能力模块或操作对象。每章固定拆成三个二级标题：`介绍`、`使用流程`、`常见问题`。

```xml
<h1 seq="auto" seq-level="auto">流程或模块名称</h1>
<h2 seq="auto" seq-level="auto">介绍</h2>
<callout emoji="💡">
  <p><b>定位：</b>说明这个流程解决什么问题、什么时候需要执行、输入和输出是什么。</p>
</callout>
<ul>
  <li>引用文档：...</li>
  <li>平台地址：...</li>
  <li>适用场景：...</li>
  <li>前置条件：...</li>
</ul>
<h2 seq="auto" seq-level="auto">使用流程</h2>
<table>
  <thead><tr><th>步骤</th><th>操作</th><th>产出</th><th>验收点</th><th>示例</th></tr></thead>
  <tbody>...</tbody>
</table>
<h2 seq="auto" seq-level="auto">常见问题</h2>
<table>
  <thead><tr><th>问题</th><th>处理方式</th><th>参考</th></tr></thead>
  <tbody>...</tbody>
</table>
```

流程章节写作规则：

- `介绍`：写定位、适用场景、前置条件、引用文档、平台入口、核心产物。不要把步骤散落在介绍里。
- `使用流程`：必须可执行。每一步写清楚操作入口、填写内容、预期结果、验收点；有截图时放在对应步骤旁边。
- `常见问题`：沉淀该流程最容易失败、最容易误解、最需要排查的问题；问题要具体，处理方式要可操作。
- 流程章节之间保持并列，不把一个流程的细节塞进另一个流程。
- 如果某流程暂无常见问题，也保留该小节并写“暂无，后续按联调问题补充”，除非用户要求精简。

## 轻量操作类文档模板

适用于很短的操作说明、一次性步骤指南或不需要完整 SOP 结构的小型手册。若用户明确要求 SOP，优先使用上面的固定模板。

```xml
<h1 seq="auto" seq-level="auto">模块名称</h1>
<callout emoji="💡">
  <p><b>适用场景：</b>说明什么时候使用这部分。</p>
</callout>
<h2 seq="auto" seq-level="auto">前置条件</h2>
<h2 seq="auto" seq-level="auto">操作流程</h2>
<table>
  <thead><tr><th>步骤</th><th>操作</th><th>产出</th><th>验收点</th><th>示例</th></tr></thead>
  <tbody>...</tbody>
</table>
<h2 seq="auto" seq-level="auto">常见问题</h2>
```
