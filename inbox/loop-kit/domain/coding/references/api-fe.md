# API FE

体验分前端创建或更新接口的 SOP。处理 H5/PC V10 请求、体验分 Kit API hook、BAM 生成包、非 BAM 手写请求、端应用接口消费前，应用本文件。

## 目标边界

新增体验分 V10 请求优先沉淀到 `@govern-public/experience-score` Kit，由 H5/PC 端应用通过 Kit 导出的稳定 hook 消费。

H5/PC 端应用不要直接新增本地 service，也不要直接依赖 `@govern-public/api-governance-shop-api`。端应用需要请求时，从 Kit 根入口消费 hook；具体 hook 名称、参数和返回类型必须读取当前代码后确定。

## 代码引用

- BAM 生成包：`packages/api/api-governance-shop-api`
- BAM 配置：`packages/api/api-governance-shop-api/bam.config.js`
- 体验分请求适配：`packages/experience-score/src/libs/api/request`
- 体验分请求 hook：`packages/experience-score/src/libs/api/services.ts`
- 非 BAM 手写类型：`packages/experience-score/src/libs/api/type.ts`
- Kit 导出入口：`packages/experience-score/src/index.ts`

## 开发流程

1. **识别接口来源**
   - 新增或变更 `ecom.governance.shop_api` 接口时，走 BAM 更新流程。
   - 接口不在 BAM 包内，或需要走非 `governance_shop_api` 路径时，走 Kit 内手写 request 流程。
   - 完成标准：能说明接口来源、生成方式、请求路径归属和消费端。

2. **更新生成物或类型契约**
   - BAM 接口：更新 BAM 配置中的服务版本，版本号以需求或接口平台为准；只在 BAM 包子目录更新生成物，不手改生成文件。
   - 非 BAM 接口：在 `type.ts` 维护 request params 和 response 类型，再让 hook 引用这些类型。
   - 完成标准：生成函数或手写类型契约可被 Kit API 层稳定引用。

3. **封装 Kit API hook**
   - 查询类请求和变更类请求都在 `services.ts` 中封装稳定 hook。
   - 新增实现前先读取 `services.ts` 中现有 query/mutation hook、版本参数常量、query key 规则和 request 适配方式。
   - `options` 只开放调用方应该控制的 query/mutation 选项，不允许覆盖 `queryKey`、`queryFn` 或 `mutationFn`。
   - 完成标准：业务组件只需要调用 hook，不感知 BAM、平台差异或 request 细节。

4. **处理平台适配**
   - 平台鉴权、运行时注入、PPE 泳道、公共参数和请求能力差异集中在 `libs/api/request`。
   - BAM 生成函数通过现有统一 options 适配罗盘路径；手写 shop API 请求通过现有路径适配函数处理同类替换。
   - 新增多平台配置接口时，先读取 `services.ts` 和 `request/` 中现有平台逻辑，再抽公共参数函数。
   - 完成标准：平台判断不散落在多个 hook 或组件中。

5. **导出并消费**
   - 新 hook 必须通过 `packages/experience-score/src/index.ts` 的稳定出口间接导出。
   - H5/PC V10 端应用从 `@govern-public/experience-score` 消费 hook。
   - 完成标准：端应用没有新增本地 service，也没有直接 import BAM 生成包。

6. **验证和记录**
   - 执行前端固定静态检查；优先使用本仓当前约定命令。
   - PC 请求默认覆盖抖店和罗盘；H5 请求默认覆盖抖店。
   - 涉及后端接口或数据口径变更时，等待后端 PPE 后再做浏览器 E2E。
   - 验收记录写明接口名、平台、请求路径、关键 params、响应关键字段和失败时的 logId。

## 关键命令

只在 BAM 包子目录执行 BAM 更新，减少对 monorepo 其他包的影响范围：

```bash
cd packages/api/api-governance-shop-api
emo run bam:update
emo run bam:install
```

变更后静态检查优先选择当前仓库已有命令：

```bash
pnpm biome check <file-path>
pnpm lint:changed
```

## 模板代码

- BAM 接口：更新 BAM 版本 -> 运行 BAM 更新命令 -> 在 `services.ts` 引用生成函数和 `ShopApi` 类型 -> 封装 query/mutation hook -> 通过 Kit 根入口导出 -> 端应用消费 hook。
- 非 BAM 接口：在 `type.ts` 维护 params/response 类型 -> 在 `request/` 复用统一请求入口和平台适配 -> 在 `services.ts` 封装 query/mutation hook -> 通过 Kit 根入口导出 -> 端应用消费 hook。
- 多平台接口：先复用现有平台适配 -> 必要时在 Kit API 层抽公共参数函数 -> hook 只拼装业务参数 -> 组件只消费 hook。

以下示例只表达代码形状；真实 hook 名称、参数、返回类型、query key 和 request 函数必须读取当前 `services.ts` 后替换。

```ts
// packages/experience-score/src/libs/api/services.ts
export function useExampleQuery(params: ExampleParams, options?: ExampleQueryOptions) {
  return useQuery({
    queryKey: ['experience-score', 'example', params],
    queryFn: () => fetchExample(params),
    ...options,
  });
}
```

```ts
// apps/experience-score-*/src/v10/**/*
import { useExampleQuery } from '@govern-public/experience-score';

const { data, isLoading, error } = useExampleQuery({ exampleId });
```

## 排查

- 接口未生成：检查 BAM 配置版本，并在 BAM 包子目录重新执行 `emo run bam:update` 和 `emo run bam:install`。
- 端应用构建缺依赖：确认端应用没有直接 import `@govern-public/api-governance-shop-api`，应从 `@govern-public/experience-score` 导入 hook。
- 罗盘请求打到抖店路径：检查是否走了 BAM 统一 options 或手写请求的路径适配函数。
- ECOP shopId 不生效：检查入口是否同步 ECOP 业务身份，以及业务 hook 是否仍通过 Kit 统一请求入口发起。
- H5 请求参数异常：检查 params 是否包含 `undefined`、数组参数是否需要重复 key、是否错误绕过 Kit request。
- PPE 验收异常：检查 PPE 泳道信息是否由宿主运行时注入；不要在业务代码里硬编码 PPE header。
