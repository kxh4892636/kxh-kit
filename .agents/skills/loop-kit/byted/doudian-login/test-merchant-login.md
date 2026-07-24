# 测试商家登录

适用于使用测试 `shopId` 进入抖店商家后台，通常用于功能验收和联调。该流程基于 fake login，由 agent 使用当前可用的浏览器控制能力操作承载用户登录态的浏览器。

## 前置条件

1. agent 可操作承载用户登录态的浏览器，并能打开页面、等待加载、读取页面信息、在页面上下文执行 JavaScript。
2. 浏览器中已有字节 SSO 登录态。
3. 已确定目标 `shopId`、访问域名和目标页面路径。

## 登录流程

### 1. 获取 SSO / cloud-boe cookie

打开以下 URL 并等待页面加载：

```text
https://sso.bytedance.com/cas/login?service=https%3A%2F%2Fcloud-boe.bytedance.net%2Fauth%2Fapi%2Fv1%2Flogin%3Fnext%3Dhttps%253A%252F%252Fcloud.bytedance.net%252Fscm%252Ffavor
```

如果 SSO 已登录，会跳转到 cloud.bytedance.net；如果停留在 SSO 登录页，提示用户手动完成 SSO。

### 2. 进入 ecop 域

fake login 接口需在 `ecop.bytedance.net` 域下调用。打开以下 URL 并等待页面加载：

```text
https://ecop.bytedance.net
```

### 3. 获取 JWT 并调用 fake login

在 `ecop.bytedance.net` 页面上下文执行：

```js
(async () => {
  const jwtRes = await fetch(
    "https://cloud-boe.bytedance.net/auth/api/v1/jwt",
    {
      method: "GET",
      mode: "cors",
      credentials: "include",
    },
  );
  const jwtToken = jwtRes.headers.get("X-Jwt-Token");
  if (!jwtToken) {
    return {
      error: "JWT 获取失败，请确认 SSO 是否已登录",
      status: jwtRes.status,
    };
  }

  const shopId = "<SHOP_ID>";
  const res = await fetch(
    `/ecomauth/manage/loginfake/get_ticket_by_bus_info?fake_type=2&expire_time=86400&account_id=${shopId}&account_type=1&website_code=doudian`,
    {
      method: "GET",
      headers: { "x-jwt-token": jwtToken },
    },
  );
  const data = await res.json();

  if (data?.data?.url) {
    window.location.href = data.data.url;
    return { success: true, msg: `正在跳转登录 shopId=${shopId}...` };
  }

  return {
    success: false,
    code: data?.code,
    msg: data?.msg || "登录失败，请确认是否有 fake login 权限",
  };
})()
```

## 登录后导航

登录成功后，导航到目标功能页面。

验收前至少确认：

- URL 位于目标访问域名。
- 页面主体非空且未白屏。
- 当前商家信息与目标 `shopId` 对应。

## 常见错误

| 错误                  | 原因                        | 处理                                  |
| --------------------- | --------------------------- | ------------------------------------- |
| SSO 页面未跳转        | 浏览器无 SSO 登录态         | 提示用户手动登录 SSO                  |
| JWT 获取失败          | cloud-boe cookie 无效       | 重新执行 SSO 跳转                     |
| fake login 返回无权限 | 当前账号缺少 loginfake 权限 | 记录返回信息并提示申请权限            |
| fetch CORS 报错       | 未在 ecop 域执行            | 先导航到 `https://ecop.bytedance.net` |
