---
id: 312c2758-2590-4b4c-8cb8-ea978737653b
---

# Security Review 暴露面供应链与链上交易

日志和错误为什么会泄露敏感数据? Solana 钱包和交易要验证什么? 依赖安全与 lock file 如何进入发布流程?

## Sensitive Data Exposure

- Logging boundary: 日志不得包含密码、token、secret、完整卡号、CVV 等敏感字段;
- Redaction: 只记录排障所需的最小信息, 例如 email、userId、卡号后四位;
- User error: 用户响应使用泛化错误, 不返回内部异常 message、stack、SQL 或依赖服务细节;
- Server log: 详细错误只进服务端日志, 并继续遵守敏感字段脱敏;

```typescript
interface PaymentLogInput {
  userId: string;
  card: { last4: string };
}

function logPaymentAttempt(logger: Logger, input: PaymentLogInput): void {
  logger.info("Payment attempt", {
    userId: input.userId,
    last4: input.card.last4,
  });
}

function toPublicErrorResponse(): Response {
  return NextResponse.json({ error: "An error occurred. Please try again." }, { status: 500 });
}
```

## Blockchain Security

- Wallet ownership: 钱包登录或绑定前必须验证签名, 证明用户持有私钥;
- Signature input: 验证对象包括 message、signature、publicKey, 任一项不可信都不能放行;
- Blind signing: 不允许用户盲签未知内容, UI 和服务端都要明确交易意图;
- Failure mode: 签名解析或验证失败时返回 false, 不把异常当成功;

```typescript
interface WalletVerifier {
  verify(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean;
}

function verifyWalletOwnership(
  input: {
    publicKey: string;
    signature: string;
    message: string;
  },
  verifier: WalletVerifier,
): boolean {
  try {
    return verifier.verify(
      Buffer.from(input.message),
      Buffer.from(input.signature, "base64"),
      Buffer.from(input.publicKey, "base64"),
    );
  } catch {
    return false;
  }
}
```

## Transaction Verification

- Recipient check: 链上交易接收方必须等于期望地址;
- Amount check: 金额必须小于等于业务允许上限;
- Balance check: 发送方余额必须足够, 防止提交必失败或异常路径交易;
- Transaction detail: recipient、amount、from 等字段都要验证, 不只验证签名存在;

```typescript
interface ChainTransaction {
  from: string;
  to: string;
  amount: number;
}

async function verifyTransaction(input: {
  transaction: ChainTransaction;
  expectedRecipient: string;
  maxAmount: number;
  getBalance(address: string): Promise<number>;
}): Promise<boolean> {
  const { transaction } = input;
  if (transaction.to !== input.expectedRecipient) throw createApiError(400, "Invalid recipient");
  if (transaction.amount > input.maxAmount) throw createApiError(400, "Amount exceeds limit");
  const balance = await input.getBalance(transaction.from);
  if (balance < transaction.amount) throw createApiError(400, "Insufficient balance");
  return true;
}
```

## Dependency Security

- Vulnerability scan: 使用 `npm audit` 检查已知漏洞, 能自动修复时用 `npm audit fix`;
- Freshness check: 使用 `npm outdated` 和定期 `npm update` 发现过期依赖;
- Lock file: package lock 必须提交, CI/CD 使用 `npm ci` 获得可复现安装;
- Automation: GitHub 上启用 Dependabot 或同类工具, 让安全更新形成持续流程;

```bash
npm audit
npm audit fix
npm outdated
npm update
git add package-lock.json
npm ci
```

## Supply Chain Gate

- Clean audit: 发布前应达到无已知高风险漏洞, 或有明确豁免理由;
- Reproducibility: lock file 漂移会让本地、CI、生产安装不同依赖, 增加不可审计风险;
- Review scope: 新增支付、认证、上传、第三方 SDK 时, 依赖本身也进入安全审查范围;
