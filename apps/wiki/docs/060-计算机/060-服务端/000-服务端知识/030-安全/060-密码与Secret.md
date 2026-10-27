---
id: 048c9248-5c78-483b-b8f4-62d26a0c1dcf
anki: true
---

# 密码与 Secret

## 密码为什么只能用慢散列存？

- 所有服务端服务适用: 快散列可被 GPU 高速爆破；慢散列把单次尝试成本抬高几个数量级;

- 只存慢散列: bcrypt、scrypt、argon2id;
- 不用 MD5/SHA-1/SHA-256 存密码，也不用可逆加密;
- 每个用户独立 salt，彩虹表失效。

## Secret 放在哪里、怎么轮换？

- 只来自环境变量或 Secret Manager，不进仓库、镜像、配置文件、日志;

- Secret 进了镜像层，即使后续删除也能从历史层取出;
- 轮换要有新旧并存窗口、灰度、回滚;
- 日志脱敏名单至少包含: `Authorization`、Cookie、密码、token、DSN。

## 注册、登录与 Secret 轮换的流程是什么？

```text
注册/改密：慢散列（cost 按硬件调）→ 存 hash
登录：取 hash → 常数时间比较 → 失败计数与限流 → 成功后签发会话/token
运维：Secret 注入 → 启动校验长度/格式 → 轮换 → 旧值保留窗口 → 下线
```

- 密码散列成本要让单次校验约 50–100ms，并按机器实测调整;
- 登录失败统一提示「用户名或密码错误」，不暴露账号是否存在;
- 日志里用固定占位符替换敏感字段，不要只按字段名过滤;
- 错误响应不返回堆栈、SQL、绝对路径、内部主机名。

## 密码散列的代码怎么写？

```go
hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
if err != nil {
	return err
}
if err := bcrypt.CompareHashAndPassword(hash, []byte(input)); err != nil {
	return ErrInvalidCredentials
}
```

```ts
const salt = randomBytes(16);
const hash = await new Promise<Buffer>((resolve, reject) =>
  scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key))),
);
```

- 散列参数要写进用户记录或配置，算法升级时能区分新旧;
- 校验失败与用户不存在要消耗相近时间，避免时间侧信道。

## 密码与 Secret 做错会有哪些症状？

| 症状                 | 原因                                |
| -------------------- | ----------------------------------- |
| 拖库后密码被快速还原 | 用了 MD5/SHA 或全局固定 salt        |
| 日志里出现完整 DSN   | 错误对象直接打印                    |
| 换密钥导致全员掉线   | 没有新旧密钥并存与灰度              |
| 登录接口被撞库       | 没有失败计数与速率限制              |
| 镜像历史里能翻到密钥 | Secret 写进 `Dockerfile` 或构建参数 |
