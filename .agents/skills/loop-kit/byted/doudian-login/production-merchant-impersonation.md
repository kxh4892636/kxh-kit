# 线上真实商家附身

适用于通过 `shopId` 进入线上真实商家的抖店页面。线上商家附身使用网络请求获取 ECOP 登录态、检查/申请附身权限，并获取附身链接。

## 入口

- ECOP 登录态页：`https://ecop.bytedance.net/businessManage/industryShop`
- 抖店附身接口 Base：`https://ecop.bytedance.net/doudian/ecop/fake_login`
- 抖店目标域：`https://fxg.jinritemai.com/`

## 完成标准

- 能从 ECOP 页面读取当前登录态 token，或明确提示用户先登录 ECOP。
- 能检查目标 `shopId` 的附身权限。
- 无权限时能以“方案设计及走查验收”为原因申请 7 天权限，并轮询到权限通过或明确超时。
- 有权限后能获取附身链接并进入目标商家态页面。
- 附身后目标页面属于抖店目标域，页面主体非空，目标店铺名或商家态信息可见。

## 操作流程

该流程参考 `ecop-fakelogin/popup.js`。核心是先在 ECOP 页面读取 `window.__PRELOAD_CONTEXT__.userInfo.token`，再用该 token 调用附身接口。

## 浏览器操作约定

线上附身必须通过用户已有浏览器登录态执行。agent 使用当前可用的浏览器控制能力操作承载用户 ECOP/抖店登录态的浏览器。

读取 ECOP token 时必须在页面主执行上下文读取 `window.__PRELOAD_CONTEXT__`。如果当前 JavaScript 执行方式看不到 `window.__PRELOAD_CONTEXT__`，先切到页面主执行上下文读取，再判断是否需要用户重新登录。

读取 token 只报告 `hasToken`、`tokenLength` 等非敏感信号，不要输出 token 原文。

### 1. 打开 ECOP 并读取 token

打开或切到 ECOP 页面，并等待页面加载：

```text
https://ecop.bytedance.net/businessManage/industryShop
```

页面加载完成后，在页面主执行上下文执行：

```js
(() => {
  const token = window.__PRELOAD_CONTEXT__?.userInfo?.token ?? null;
  return JSON.stringify({
    href: location.href,
    title: document.title,
    hasPreload: Boolean(window.__PRELOAD_CONTEXT__),
    hasToken: Boolean(token),
    tokenLength: token ? String(token).length : 0
  });
})()
```

如果 token 为空：

- 刷新 ECOP 页面后再读一次。
- 仍为空时，提示用户先登录 ECOP。
- 不要伪造 token，也不要在报告中回显 token。

### 2. 检查权限

继续在 ECOP 页面主执行上下文中调用。推荐把 token 的读取和接口请求放在同一个页面内表达式中，避免 token 被带出页面上下文：

```js
(async () => {
  const token = window.__PRELOAD_CONTEXT__?.userInfo?.token ?? null;
  const shopId = '<SHOP_ID>';
  const base = 'https://ecop.bytedance.net/doudian/ecop/fake_login';
  if (!token) return JSON.stringify({ step: 'check', ok: false, error: 'NO_TOKEN' });
  const resp = await fetch(base + '/auth/check?shop_id=' + encodeURIComponent(shopId) + '&__token=' + encodeURIComponent(token), {
    credentials: 'include',
  });
  const data = await resp.json();
  return JSON.stringify({ step: 'check', httpStatus: resp.status, data });
})()
```

处理结果：

- `data.has_auth === true`：已有附身权限，继续获取附身链接。
- `data.has_auth === true && data.fake_num_check === false`：附身次数已达上限，停止并报告。
- `data.has_auth === false`：进入权限申请。
- 响应结构异常或非成功 code：记录返回信息并标为待确认。

### 3. 无权限时申请 7 天权限

沿用第 2 步的页面主执行上下文方式调用 `POST /auth/batch_apply?__token=<token>`，请求体为：

```json
{
  "entity_infos": [{ "entity_id": "<SHOP_ID>", "entity_name": "<SHOP_ID>" }],
  "apply_num": 7,
  "apply_reason": "方案设计及走查验收",
  "apply_type": 1
}
```

如果 `code !== 0`，记录 `msg` 和返回数据，标为待确认，不继续假设权限已申请成功。

### 4. 轮询等待权限通过

提交申请后，继续使用权限检查接口轮询审批结果。轮询接口与第 2 步相同：

```text
GET https://ecop.bytedance.net/doudian/ecop/fake_login/auth/check?shop_id=<SHOP_ID>&__token=<token>
```

每 3 秒调用一次，最多等待 5 分钟。成功条件是响应中 `data.has_auth === true`；如果 `code !== 0`、响应结构异常或一直未返回 `has_auth=true`，不要继续假设权限已生效。

轮询也在页面主执行上下文中执行，避免 token 离开页面。每次轮询只返回审批状态、耗时和接口 code/msg，不返回 token。

超时后不要继续假设权限已生效，报告“等待审批超时”。

### 5. 获取附身链接并打开

```js
(async () => {
  const token = window.__PRELOAD_CONTEXT__?.userInfo?.token ?? null;
  const shopId = '<SHOP_ID>';
  const base = 'https://ecop.bytedance.net/doudian/ecop/fake_login';
  if (!token) return JSON.stringify({ step: 'url', ok: false, error: 'NO_TOKEN' });
  const resp = await fetch(base + '/url?__token=' + encodeURIComponent(token), {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ shop_id: shopId }),
  });
  const data = await resp.json();
  return JSON.stringify({
    step: 'url',
    httpStatus: resp.status,
    code: data?.code,
    msg: data?.msg,
    hasUrl: Boolean(data?.data),
    urlPrefix: data?.data ? String(data.data).slice(0, 80) : null,
    url: data?.data
  });
})()
```

如果 `code === 0` 且 `data` 是 URL，打开该 URL 并等待页面加载，再导航到目标业务页面执行 E2E。

实测中附身链接会先跳到 `https://fxg.jinritemai.com/ffa/mshop/homepage/index`。这是正常中间态；确认进入抖店域后，再导航到目标验收页面，例如体验分页面。

成功后至少断言：

- URL 属于 `https://fxg.jinritemai.com/`。
- 页面主体非空。
- 目标店铺名或商家态信息可见。

## 常用验证入口

体验分页面：

```text
https://fxg.jinritemai.com/ffa/eco/experience-score
```

## 异常处理

| 异常                                             | 处理                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| ECOP token 为空                                  | 刷新 ECOP 页面重试；仍为空则提示用户登录 ECOP                            |
| 当前 JS 执行方式看不到 `__PRELOAD_CONTEXT__`      | 不要判定未登录；切到页面主执行上下文读取                                  |
| 权限检查接口异常                                 | 记录响应与错误，标为待确认                                               |
| 附身次数已达上限                                 | 停止附身，记录 `fake_num_check` 结果                                     |
| 权限申请失败                                     | 记录 `code/msg`，标为待确认                                              |
| 轮询审批超时                                     | 停止等待，报告审批超时和目标 `shopId`                                    |
| 获取附身链接失败                                 | 记录 `code/msg`，标为待确认                                              |
| 附身链接打开后未进入抖店域                       | 记录最终 URL、页面标题和接口返回，标为待确认                             |
| 目标页有弹窗遮挡                                 | 先用 URL、店铺名和主体内容判断商家态；按测试需要再关闭弹窗               |
