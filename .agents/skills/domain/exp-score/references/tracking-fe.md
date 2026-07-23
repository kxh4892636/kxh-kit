# Experience Score Tracking FE

体验分前端创建、更新和发送埋点的 SOP。处理 H5/PC V10 埋点、体验分 Kit 埋点入口、事件模型、公共参数、端应用埋点调用或埋点排查前，应用本文件。

## 目标边界

新增体验分 V10 埋点优先使用 `@govern-public/experience-score` 导出的统一入口，不在 H5/PC 端应用里复制埋点封装。

端应用只消费 Kit 埋点能力。具体导入方式、函数签名、事件名、字段类型和调用参数必须读取当前代码后确定。

## 代码引用

- Kit 导出入口：`packages/experience-score/src/index.ts`
- 体验分埋点入口：`packages/experience-score/src/libs/tea.ts`
- 事件模型：读取 `ExperienceScoreEvents` 及对应事件 params 类型
- 公共参数：读取 `ExperienceScoreCommonParams` 和公共参数生成逻辑
- 初始化与上报配置：读取 `startTea`、collector 初始化和错误回调相关代码

## 开发流程

1. **识别改动类型**
   - 新增事件：先确认事件名、触发时机、业务字段、平台范围和验收方式。
   - 更新事件：先确认兼容性，避免改坏已有消费方或历史口径。
   - 发送事件：先确认调用点是否属于 H5/PC V10 或 Kit 能力边界。
   - 完成标准：能说明事件归属、触发时机、字段来源、消费端和验证方式。

2. **读取现有模型**
   - 读取 `packages/experience-score/src/libs/tea.ts` 中当前事件模型、公共参数、发送入口和初始化逻辑。
   - 不在调用方猜测函数签名，不用 `as any` 绕过事件字段类型。
   - 完成标准：新增或更新字段能落到现有类型体系里。

3. **扩展事件契约**
   - 新增事件名或字段时，先扩展 Kit 内事件模型和对应 params 类型。
   - 公共参数只在 Kit 统一逻辑里维护；业务埋点只传当前事件自己的业务字段。
   - 完成标准：事件名、业务字段和公共参数各有明确来源。

4. **接入发送入口**
   - 端应用从 `@govern-public/experience-score` 消费统一埋点入口。
   - 不新增端应用本地 `utils/tea.ts` 封装；存量迁移时逐步收敛到 Kit 入口。
   - 完成标准：调用方不重复初始化 Tea SDK，不复制公共参数生成逻辑。

5. **验证埋点**
   - PC 验收默认覆盖抖店和罗盘；H5 验收默认覆盖抖店。
   - 需要按来源区分时，验收 URL 带上对应来源参数。
   - 浏览器控制台出现 SDK 上报错误时，记录 event data、error code 和触发路径。
   - 完成标准：验收记录写明事件名、平台、触发动作、关键业务字段、公共参数口径和失败时的 SDK 错误信息。

## 关键命令

变更后静态检查优先选择当前仓库已有命令：

```bash
pnpm biome check <file-path>
pnpm lint:changed
```

定位埋点代码时优先读取稳定入口和调用点：

```bash
rg "sendExperienceScoreEvent|ExperienceScoreEvents|startTea" packages/experience-score apps/experience-score-h5 apps/experience-score-pc
```

## 模板代码

- 新增事件：确认需求口径 -> 读取 `tea.ts` 当前事件模型 -> 扩展事件名和 params 类型 -> 从 Kit 根入口消费发送函数 -> 在触发点传业务字段 -> 静态检查 -> 浏览器验收。
- 更新事件：定位事件定义和调用点 -> 判断是否影响历史口径 -> 更新类型和调用字段 -> 验证涉及平台 -> 记录字段变化。
- 发送事件：读取当前导出和函数签名 -> 在 V10 调用点接入统一入口 -> 只传业务字段 -> 验证公共参数由 Kit 自动生成。

以下示例只表达发送形状；真实导出名、事件名、字段名和字段类型必须读取当前 `tea.ts` 后替换。

```ts
import { sendExperienceScoreEvent } from '@govern-public/experience-score';

sendExperienceScoreEvent('example_event', {
  exampleField: exampleValue,
});
```

## 排查

- 入口不统一：确认调用方是否从 `@govern-public/experience-score` 导入埋点能力；存量端应用本地封装先标记迁移边界。
- 事件名或字段异常：读取 `ExperienceScoreEvents` 和对应 params 类型；新增事件必须先扩展类型。
- 公共参数异常：读取 `ExperienceScoreCommonParams` 和公共参数生成逻辑，按字段数据来源排查。
- 平台判断异常：读取当前平台判断逻辑，重点检查 H5、PC、抖店、罗盘、ECOP 相关分支。
- 来源参数缺失：需要来源区分时检查验收 URL 和公共参数生成逻辑。
- SDK 上报失败：按浏览器控制台输出的 event data、error code 和错误回调排查。
