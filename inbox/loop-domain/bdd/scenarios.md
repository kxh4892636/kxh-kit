# 好场景与坏场景

## 好场景

**行为示例**：用领域语言描述规则与结果。

```gherkin
# 好：规格化可观察的业务行为
Scenario: 已批准客户在信用额度内下单
  Given Alice 是信用额度为 500 的已批准客户
  And 她的购物车总额是 120
  When 她下单
  Then 订单被确认
  And 她的可用信用额度是 380
```

特征：

- 描述用户或利益相关方关心的行为
- 只使用领域语言
- 包含具体值
- 验证可观察结果
- 能经受 UI、存储和服务重构
- 每个场景只覆盖一条业务规则

## 坏场景

**步骤脚本化场景**：与 UI 或传输机制耦合。

```gherkin
# 坏：描述界面操作，而不是行为
Scenario: 提交结账表单
  Given 我打开 "/checkout"
  And 我在 "#customer-name" 中输入 "Alice"
  And 我点击 ".submit-button"
  Then 我看到 ".toast-success"
```

危险信号：

- 场景名描述的是屏幕动作
- 步骤提到选择器、端点、表名或实现对象
- 期望结果是 UI 产物，而不是领域结果
- 交付机制变化后场景就坏了

**耦合实现的场景**：命名内部结构，而不是公共行为。

```gherkin
# 坏：规格化内部存储
Scenario: 创建订单会插入订单行
  Given orders 表为空
  When 使用 Alice 的购物车调用 OrderService.create
  Then orders 表包含一行状态为 "CONFIRMED" 的记录
```

```gherkin
# 好：通过行为验证
Scenario: 客户结账后可以查看已确认订单
  Given Alice 是已批准客户
  And 她的购物车包含一笔 120 的订单
  When 她下单
  Then 她可以查看一笔 120 的已确认订单
```

**含糊场景**：缺少具体示例。

```gherkin
# 坏：没有指定期望值
Scenario: 应用折扣
  Given 客户拥有有效折扣数据
  When 计算折扣
  Then 显示正确折扣
```

```gherkin
# 好：期望值来自推导好的示例
Scenario: 金牌客户获得百分之十折扣
  Given Alice 是金牌客户
  And 她的购物车总额是 200
  When 计算折扣
  Then 折扣是 20
  And 最终总额是 180
```
