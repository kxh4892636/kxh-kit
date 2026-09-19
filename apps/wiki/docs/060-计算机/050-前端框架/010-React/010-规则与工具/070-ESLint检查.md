---
id: e12607f0-ad18-4c3a-8e34-205542a48cd4
---

# React ESLint 检查

## ESLint 插件能检查哪些 React 行为？

- 调用规则: rules-of-hooks 检查 Hook 位置与调用方式，exhaustive-deps 检查 Effect 等依赖是否完整;
- 编译相关: 插件还报告不纯渲染、可变值、动态组件等问题，不要求项目先启用编译器才有价值;
- 静态边界: 规则用于发现可分析的问题，无法证明全部业务流程正确，也不会替代运行与交互验证;

## 如何为项目启用推荐规则？

- 项目依赖: 安装 ESLint 与 eslint-plugin-react-hooks，并选择匹配当前 ESLint 配置格式的规则集;
- Flat 配置: 新配置可直接使用插件提供的 flat recommended，保留项目原有文件范围与语言设置;

```bash
npm install -D eslint eslint-plugin-react-hooks
```

```js
import reactHooks from "eslint-plugin-react-hooks";

export default [reactHooks.configs.flat.recommended];
```

## 如何把自定义 Effect Hook 纳入依赖检查？

- 明确匹配: 用 additionalEffectHooks 正则列出具有 Effect 语义的自定义 Hook，避免漏检其回调依赖;
- 抽象审视: 如果自定义 Hook 频繁隐藏依赖，先检查接口是否应该改成 useChatRoom 等高层用途;

```js
export default [
  {
    settings: {
      "react-hooks": {
        additionalEffectHooks: "(useMyEffect|useSubscriptionEffect)",
      },
    },
  },
];
```

## 依赖告警应该怎样修复？

- 对照读取: 找到闭包读取的响应式值，添加依赖或改变代码归属，不能先删规则;
- 重构入口: 拆分同步、更新函数、对象构造与 Effect Event 的选择见移除 Effect 依赖;
- 版本核对: 使用配置项前核对所装插件版本;

## 组件或 Hook 无法静态分析时怎样定位？

| 规则                     | 核心问题                | 修复方向                         |
| ------------------------ | ----------------------- | -------------------------------- |
| component-hook-factories | 工厂动态定义组件或 Hook | 改成模块顶层定义与明确参数       |
| static-components        | 渲染中不断创建组件类型  | 稳定组件身份                     |
| unsupported-syntax       | 编译器暂不支持的语法    | 简化或隔离对应函数               |
| incompatible-library     | 库接口不符合缓存假设    | 检查适配方式，必要时局部退出编译 |

- 处理原则: 不把无法编译与运行时一定错误混为一谈，先区分规则违规还是工具能力边界，再决定修改范围;

## 不可变与纯度诊断怎样回到数据流问题？

| 规则         | 重点检查                                 |
| ------------ | ---------------------------------------- |
| globals      | 渲染中修改全局值                         |
| immutability | 修改已有 props、state 或其他应不可变的值 |
| purity       | 渲染中使用已知不纯操作                   |
| refs         | 渲染中不恰当地读写 ref                   |

- 修复归属: 纯度与不可变更新见对应主笔记，诊断表只用于定位，不以复制一段“安全写法”代替理解共享引用;

## 状态更新诊断分别指出什么问题？

- set-state-in-render: 检查会引发循环的渲染时更新，优先推导值或改为事件；有条件记录前次输入属于狭窄例外;
- set-state-in-effect: 检查本可直接计算却在 Effect 同步设置 state 的模式，避免额外渲染；布局测量等真实同步需求需要按语义判断;
- error-boundaries: 不用 try/catch 包 JSX 来捕获后代渲染错误，后代执行发生在 React 调用阶段，应使用错误边界;

## 缓存诊断为什么不能只靠删除依赖解决？

- use-memo: 检查 useMemo 是否返回计算结果，它不是执行副作用的容器;
- preserve-manual-memoization: 检查编译是否能保留已有手动缓存的语义，先修复缺失依赖与不明确的数据流;
- 语义优先: 删除 useMemo 或依赖可能消除告警却改变行为，先确认缓存承担的是性能还是被误当作状态;

## 配置诊断应该如何处理？

- config: 核对编译器选项名称、类型与支持值，避免从不同版本配置中拼接;
- gating: 核对开关模块、导出函数和可用运行环境，避免构建成功但产物加载失败;
- 定位闭环: 记录涉及文件和具体规则，完成修改后运行同一检查，再验证对应业务场景;
