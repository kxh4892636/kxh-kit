---
id: b8fcf1bf-919f-41b9-801f-bbae9e3694cc
---

# TCP 状态转换与 SYN 洪泛

## 客户端经历哪些 TCP 状态？

1. 发送 SYN 报文, 进入 `SYN_SENT`;
2. 收到 SYNACK 并回送 ACK, 连接建立, 进入 `ESTABLISHED`;
3. 关闭连接时发送 FIN 报文, 进入 `FIN_WAIT_1`;
4. 收到服务器 ACK 报文, 进入 `FIN_WAIT_2`;
5. 收到服务器 FIN 报文并回送 ACK, 进入 `TIME_WAIT`;
6. 等待若干时间后关闭连接, 进入 `CLOSE`;

![客户端状态](../../images/2024-04-16-10-43-35.png)

## 服务器经历哪些 TCP 状态？

1. 创建 TCP 后进入 `LISTEN`;
2. 收到客户端 SYN 并回送 ACK, 进入 `SYN_RCVD`;
3. 收到客户端 ACK, 连接建立, 进入 `ESTABLISHED`;
4. 收到客户端 FIN 并回送 ACK, 进入 `CLOSE_WAIT`;
5. 剩余数据发完后发送 FIN 报文, 进入 `LAST_ACK`;
6. 收到客户端 ACK, 关闭连接, 进入 `CLOSE`;

![服务器状态](../../images/2024-04-16-10-47-42.png)

## SYN 洪泛攻击如何产生？

- 服务器成本: 发出 SYNACK 后必须维持一个半开连接, 等待客户端确认;
- 攻击方式: 攻击者发送大量 SYN 报文段, 但从不确认服务器回送的 SYNACK;
- 后果: 服务器为大量半开连接耗尽资源, 无法服务正常客户端;

## SYN cookie 如何防御？

- 不立即分配: 服务器收到 SYN 后不生成半开连接;
- 构造序号: 基于 SYN 报文的 IP 地址与端口号计算出一个 TCP 序列号作为 `server_isn`;
- 延迟分配: 直到收到客户端回送的合法 ACK 报文, 才创建全开连接并分配资源;
