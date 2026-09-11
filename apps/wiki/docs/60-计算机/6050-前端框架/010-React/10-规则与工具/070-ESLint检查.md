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
- 版本核对: 使用配置项前核对所装插件版本，诊断分类与逐类处理见下一篇;
