# Experience Score V10 Components

体验分 V10 前端组件开发 SOP。开发页面、feature、common 或 Kit 组件前，先确定组件落点、依赖边界、组件库、数据和埋点接入方式。

## 开发流程

1. **确定落点**
   - 页面级组合、路由参数适配、页面级 loading/error/empty 和 feature 编排，放在 `src/v10/pages`。
   - 页面内业务用例、业务组件、业务 hooks、状态编排和领域规则，放在 `src/v10/features`。
   - 端应用级通用 UI、布局、鉴权、hooks、样式和纯工具函数，放在 `src/v10/common`。
   - 双端共享的体验分领域类型、规则、hooks、领域 UI 和 API contract，优先放在 `packages/experience-score/src/features` 或 Kit `common/libs`。
   - 完成标准：能说明组件属于 page、feature、common 还是 Kit，并能指出它允许依赖的层。

2. **判断双端同构**
   - PC/H5 的业务语义、指标口径、接口消费、埋点语义和页面模块一致时，优先把复用能力沉淀到 `packages/experience-score/src`。
   - 容器、布局密度、交互组件和跳转能力属于端差异，集中在上下文注入、adapter 和少量端型组件中。
   - 业务口径一致、数据来源一致：沉淀到 Kit `features` 或 `libs`。
   - 端型选择一致、渲染不同：优先使用 Kit 的 `deviceAdapter`；具体 API 读取 `packages/experience-score/src/common/adapter/device-adapter.tsx` 和现有 feature 用法。
   - 端型字段、商家态、平台态：通过 `CrossContextProvider` 注入；Kit 组件内部通过 `useCrossContext()` 消费，不自行判断 `window`、`navigator`、URL 或宿主全局变量。
   - 完成标准：能给出“共享什么、端差异在哪里收敛、端应用保留什么”的判断。

3. **选择组件库**
   - 体验分图表只能使用 `@visactor/react-vchart`，不要引入或新增其他图表库。
   - PC 端体验分 UI 只能使用 `@ecom/aurora`，不要在 PC V10 中新增 `@ecom/auxo`、`@ecom/aurora-mobile-biz` 或其他端组件库。
   - H5 端体验分 UI 只能使用 `@ecom/aurora-mobile-biz`，不要在 H5 V10 中新增 `@ecom/aurora`、`@ecom/auxo`、`@ecom/auxo-mobile` 或其他端组件库。
   - Kit 中做双端重构时，根据平台选择对应组件库：PC 分支使用 `@ecom/aurora`，H5 分支使用 `@ecom/aurora-mobile-biz`。
   - Kit 中可复用的非 UI 逻辑优先保持组件库无关；只有确实需要沉淀双端 UI 能力时，才在 Kit 内引入上述组件库，并通过平台适配隔离 PC/H5 差异。
   - 完成标准：新增 import 没有引入错误端组件库或新图表库。

4. **组织组件边界**
   - 组件只接收当前业务需要的 props，不把路由、平台、请求、埋点和全局状态透传成无边界对象。
   - 页面负责路由参数适配和 feature 编排；feature 负责业务状态和领域规则；Kit 负责双端共享领域能力。
   - 端型统一使用 `deviceType` 表达；需要布尔判断时在局部派生 `deviceType === 'H5'` 或 `deviceType === 'PC'`。
   - 端差异不要塞进 Kit 的业务逻辑里；需要适配时通过参数、adapter、slot/render props、`deviceAdapter` 或端型组件抽象。
   - 不要在多个子组件中重复端型判断；判断开始扩散时，回收到上层组合组件或 `deviceAdapter`。
   - 完成标准：组件职责能用一句话说明，且没有跨层读取不属于自己的环境。

5. **接入数据与埋点**
   - 网络请求创建或更新时，先读取 [api-fe.md](api-fe.md)。
   - 埋点创建、更新或发送时，先读取 [tracking-fe.md](tracking-fe.md)。
   - 业务组件通过稳定 hook 发请求并消费统一埋点入口；可以 type-only import BAM 生成类型，但不直接调用 BAM 生成函数，也不绑定 request 适配细节或 Tea SDK 初始化。
   - 完成标准：组件不新增本地 service，不复制平台请求适配或埋点公共参数逻辑。

6. **导出与复用**
   - 只在确有跨文件或跨端复用时新增稳定出口。
   - H5/PC 端应用优先从 `@govern-public/experience-score` 根入口消费 Kit 能力。
   - 不要因为“以后可能复用”就提前把所有页面逻辑搬进 Kit；以明确复用或明确领域稳定性为准。
   - 完成标准：导出面只覆盖真实调用方，不泄漏单端特有命名到 Kit API。

## 模板代码

### 双端同构代码

```tsx
// packages/experience-score/src/features/example/example-card-pc.tsx
export const ExampleCardPc = () => {
  // PC 组件逻辑
};

// packages/experience-score/src/features/example/example-card-h5.tsx
export const ExampleCardH5 = () => {
  // H5 组件逻辑
};

// packages/experience-score/src/features/example/index.tsx
import { deviceAdapter } from "../../common/adapter";
import { ExampleCardH5 } from "./example-card-h5";
import { ExampleCardPc } from "./example-card-pc";

export const ExampleCard = deviceAdapter({
  PC: ExampleCardPc,
  H5: ExampleCardH5,
});
```
