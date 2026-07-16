# Experience Score E2E Profile

本 reference 只提供体验分 E2E 的领域参数。验收文档结构、场景规则、真实路径执行和证据标准由 e2e skill 定义。

## 文档落点

- 前端仓库根目录是 `repos/govern-public-fe-mono`。
- 体验分 E2E 目录是受影响端的 `apps/experience-score-*/src/v10/features/<feature>/e2e/`。
- 根据修改文件、需求、路由和页面区域定位 `<feature>`；H5 落到 `apps/experience-score-h5`，PC 落到 `apps/experience-score-pc`。
- 同一需求横跨 H5、PC 或共享 Kit 时，在受影响的 H5/PC feature 下维护文档并列出 Kit 影响；各端路径明显不同时分别维护。
- 无法确定 feature 时，先从变更文件、V10 页面和下文路由定位；仍无代码事实时再向用户索取模块信息。

完成标准：每个受影响端都有唯一文档落点；Kit 改动已映射到至少一条真实 H5/PC 消费路径。

## 覆盖矩阵

- PC 需求默认覆盖抖店和罗盘；按影响面选择下文具体页面，不做无依据的全路由遍历。
- H5 需求覆盖抖店。
- 图表、权益、分层说明和诊断建议优先断言关键文本、状态、数值、可点击能力和截图。
- 数据场景明确 `shopId`、score type、`doneDate`、TCC、接口返回样例或固定测试商家的口径。
- 动态订单号、商品 ID、客服 ID 和分数值只记录为执行事实；稳定场景写可重建数据条件。

完成标准：测试矩阵明确端型、平台、页面、商家与数据口径，且每个维度都能追溯到需求或影响面。

## PC 路由

代码路由：`repos/govern-public-fe-mono/apps/experience-score-pc/src/routes.tsx`。

| 平台 | URL                                                                   |
| ---- | --------------------------------------------------------------------- |
| 抖店 | `https://fxg.jinritemai.com/ffa/eco/experience-score`                 |
| 抖店 | `https://fxg.jinritemai.com/ffa/eco/experience-category`              |
| 抖店 | `https://fxg.jinritemai.com/ffa/eco/experience-score/detail`          |
| 抖店 | `https://fxg.jinritemai.com/ffa/eco/experience-score/rights`          |
| 罗盘 | `https://compass.jinritemai.com/shop/ecology/experience-score`        |
| 罗盘 | `https://compass.jinritemai.com/shop/ecology/experience-category`     |
| 罗盘 | `https://compass.jinritemai.com/shop/ecology/experience-score/detail` |
| 罗盘 | `https://compass.jinritemai.com/shop/ecology/experience-score/rights` |

## H5 路由

页面配置：`repos/govern-public-fe-mono/apps/experience-score-h5/pia.config.ts`；route base 是 `/govern/h5/ecology`。

| 平台 | URL                                                                            |
| ---- | ------------------------------------------------------------------------------ |
| 抖店 | `https://fxg.jinritemai.com/govern/h5/ecology/experience-score`                |
| 抖店 | `https://fxg.jinritemai.com/govern/h5/ecology/experience-score-rules`          |
| 抖店 | `https://fxg.jinritemai.com/govern/h5/ecology/experience-score-rights`         |
| 抖店 | `https://fxg.jinritemai.com/govern/h5/ecology/experience-score-detail`         |
| 抖店 | `https://fxg.jinritemai.com/govern/h5/ecology/experience-score-grow-detail`    |
| 抖店 | `https://fxg.jinritemai.com/govern/h5/ecology/experience-score-grow-stage`     |
| 抖店 | `https://fxg.jinritemai.com/govern/h5/ecology/experience-score-content-center` |

## 商家态与运行态

1. 调用 `/doudian-login` skill，准备与环境、平台、`shopId` 和页面路径一致的商家态。完成标准：目标 URL 可访问，页面中的商家身份与场景数据一致。
2. 本地验收前检查 `emo start`、`edenx` 或 `webpack` 运行进程；已有目标 app 时等待 HMR 编译当前代码，新启动命令读取 [command-common.md](command-common.md)。完成标准：运行输出或页面版本事实证明当前代码已生效。
3. ECOP 场景需要宿主预加载信息时，在页面主执行上下文读取 `window.__PRELOAD_CONTEXT__`。完成标准：只把与身份、平台或路由断言相关的字段写入证据。
4. 截图前处理活动、权限或登录弹窗，并记录处理动作。完成标准：目标区域无遮挡且会话前置可复现。

## 文档维护流程

E2E 文档按需求流程、回归流程两步维护：

1. **需求流程**：使用 `yyyy-mm-dd-<feature-name>.md`，记录当次需求的测试矩阵、场景、执行记录和证据。完成标准：需求范围内的场景全部为 `passed`，且每个场景都有目标版本、真实路径和证据。
2. **回归流程**：固定维护 `index.md`，沉淀长期稳定、可重复执行的 E2E 流程，用于日常回归走查。准入门槛：需求流程达到完成标准后，其中的稳定场景才能合入 `index.md`。

回归流程补充规则：

- H5、PC 与共享 Kit 同时受影响时，各端 `index.md` 只收录本端真实页面证明的路径；Kit 影响通过这些消费路径表达。
- 一次性商家状态、偶发数据、历史样例 ID 和排障动作留在需求文档。
