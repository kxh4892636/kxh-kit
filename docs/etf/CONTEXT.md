# ETF 行情

由行情前端与行情后端共同拥有证券查询、日线行情和派生图表的领域语言。

## Language

**ETF 产品**：
由 etf-dashboard 和 etf-service 组成的行情产品，可以管理 ETF、指数等多种证券。
_Avoid_：用 ETF 指代每一个证券

**证券（Security）**：
系统可列出并查询行情的统一标的，具体类别由资产类型表达。
_Avoid_：用 ETF 或 Index 统称所有标的

**资产类型（Asset Type）**：
证券的类别，例如 ETF 或指数。
_Avoid_：Security Type

**虚拟均线（Virtual MA）**：
由混合运算表达式引用各周期 MA，在每个 K 线时间点逐点求值得到的派生序列，以虚线展示。
_Avoid_：把表达式引用的普通 MA 称为虚拟均线

**前复权（qfq）**：
当前支持的日线价格复权口径，使历史价格按当前价格尺度连续展示。
_Avoid_：用上游协议参数 adjust=1 表达领域概念
