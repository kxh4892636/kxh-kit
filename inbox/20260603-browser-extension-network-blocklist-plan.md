# 浏览器插件网络黑名单计划

## 完成标准

当一个无框架浏览器插件可以在 Chrome/Chromium 中以“加载已解压的扩展程序”方式运行，并满足以下行为时，任务完成：

- 插件通过弹窗界面保存多条黑名单和白名单字符串。
- 列表输入支持按空格、Tab、回车、换行、英文逗号分隔。
- 使用字符串包含关系判断当前标签页 URL 是否命中规则。
- 当前标签页 URL 命中任意白名单字符串时，允许该页面网络请求，即使它同时命中黑名单。
- 当前标签页 URL 命中黑名单且未命中白名单时，阻断该标签页页面发起的网络请求。
- 标签页跳转到未命中 URL 或白名单 URL 后，及时移除阻断规则。
- 提供一组可手动验证的加载和测试步骤。

第一版不做以下事项：

- 不使用框架、打包工具、包管理器或构建流程。
- 不做远程规则订阅、正则规则语法或广告过滤器语法。
- 不做商店发布打包。
- 不保证 Chrome/Chromium Manifest V3 以外浏览器的兼容性。

## 当前上下文

用户要求创建一个浏览器插件，使用原生 HTML/CSS/JS 开发，不使用任何框架。插件需要监听当前标签页 URL：如果 URL 包含黑名单字符串，则禁止该页面的一切网络请求；如果 URL 包含白名单字符串，则允许网络请求，且白名单优先级高于黑名单。黑名单和白名单都支持多个字符串，分隔符包括空格、回车、换行、英文逗号。

本文件是按 `plan-with-doc` 技能边界创建的计划文档，因此当前步骤只做计划沉淀，不执行插件代码实现。

## 事实、假设与判断

事实：

- 仓库浅层搜索未发现已有浏览器插件目录或明显的 `manifest.json`。
- Chrome Manifest V3 下，常规扩展不应依赖 `webRequestBlocking` 做同步阻断；应使用 `chrome.declarativeNetRequest` 管理阻断规则。
- `chrome.declarativeNetRequest` 支持由 JavaScript 管理的 session rules，并支持通过 `tabIds` 将规则限定到特定标签页，适合按当前标签页状态控制阻断。
- `declarativeNetRequest` 支持 `allow`、`allowAllRequests` 与 `block` 等动作，但本方案优先采用“命中白名单时不安装阻断规则”的方式实现白名单优先级，逻辑更直接。
- 已核对官方文档：
  - https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
  - https://developer.chrome.com/docs/extensions/reference/api/webRequest

假设：

- 目标浏览器为 Chrome/Chromium，扩展规范使用 Manifest V3。
- 用户描述中“白名单：如果 url 包含黑名单的字符串，允许网络请求”里的“黑名单”应为笔误，实际含义是“如果 URL 包含白名单字符串，允许网络请求”。
- “一切网络请求”在第一版中定义为：页面已完成主导航后，该标签页页面发起的子资源、XHR/fetch、图片、脚本、样式、媒体、WebSocket 等网络请求；默认不阻断标签页主导航本身。
- 第一版接受一个很小的导航时序窗口：如果页面刚开始加载、后台 service worker 尚未完成 URL 判断，极早发出的请求可能已经开始。

判断：

- 使用 `chrome.declarativeNetRequest.updateSessionRules()`，而不是 dynamic rules。原因是阻断规则只与当前浏览器会话和标签页状态相关，浏览器重启后自然清空更符合预期。
- 每个被阻断的标签页使用一条 session block rule，条件为 `condition.tabIds: [tabId]` 和 `urlFilter: "*"`。
- 不使用 static rules，因为黑白名单由用户动态配置，且判断对象是顶层标签页 URL，而不是固定的请求 URL 规则集。
- 文件结构保持扁平，Chrome 可直接加载，不引入构建工具。

## 设计决策树

1. 目标运行时：Chrome/Chromium Manifest V3。
   - 依赖关系：决定使用 DNR 还是阻塞式 `webRequest`。
   - 决策：使用 Manifest V3 与 `declarativeNetRequest`。

2. 匹配模型：普通字符串包含匹配。
   - 依赖关系：决定存储结构、解析规则和 UI 校验方式。
   - 决策：使用 `split(/[,\s]+/)` 解析输入，随后 trim、过滤空字符串、去重，并默认大小写敏感；如果用户后续要求，再改成大小写不敏感。

3. 白名单优先级：
   - 依赖关系：决定规则生成方式。
   - 决策：先检查白名单，再检查黑名单。命中白名单时移除当前标签页阻断规则，并显示允许状态。

4. 阻断范围：
   - 依赖关系：决定 DNR rule condition。
   - 决策：命中黑名单的标签页添加一条 session rule，阻断该 tab 下所有请求 URL；默认不阻断 `main_frame`，避免插件阻止用户进入页面本身。

5. 用户界面：
   - 依赖关系：决定存储交互和反馈方式。
   - 决策：popup 包含两个 textarea、保存按钮、当前标签页 URL 展示和一个紧凑状态行，状态为：允许、已阻断、未命中。

## 建议文件结构

创建一个无需构建的扩展目录：

```text
apps/url-network-guard-extension/
  manifest.json
  background.js
  popup.html
  popup.css
  popup.js
  README.md
```

第一版不需要 `package.json`。

## 实施计划

1. 创建扩展骨架。
   - 添加 `manifest.json`，包含 `manifest_version: 3`、`action.default_popup`、`background.service_worker`。
   - 权限声明包含：`declarativeNetRequest`、`storage`、`tabs`。
   - 验证点：Chrome 可以无错误加载该解压扩展。

2. 实现列表解析和持久化。
   - 在 `popup.js` 中读取和写入 `chrome.storage.local`。
   - 建议存储字段：`blacklistRaw`、`whitelistRaw`、`blacklist`、`whitelist`。
   - 解析规则：使用 `/[,\s]+/` 分隔，trim，过滤空字符串，按首次出现顺序去重。
   - 验证点：输入 `foo bar\nbaz\r\nqux,quux` 可解析为五个条目。

3. 实现标签页 URL 判断。
   - 在 `background.js` 中实现 `getMatchState(url, blacklist, whitelist)`，返回 `allowed`、`blocked` 或 `neutral`。
   - 判断顺序固定为：白名单优先，然后黑名单。
   - 对 `chrome://`、`edge://`、`about:`、扩展自身页面等非普通网页 URL，直接清理阻断规则。
   - 验证点：同一个 URL 同时包含白名单和黑名单字符串时，结果为 `allowed`。

4. 实现按标签页管理 DNR session rule。
   - 为每个 tab 生成稳定 rule id，建议使用一个保留范围加 tab id。
   - 监听 `tabs.onUpdated`、`tabs.onActivated`、`tabs.onRemoved`、`windows.onFocusChanged` 和 storage 变更。
   - 命中黑名单时调用 `chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id], addRules: [rule] })`。
   - 命中白名单或未命中时调用 `updateSessionRules` 移除该 tab 的 rule。
   - 验证点：跳转离开黑名单 URL 后规则被移除；关闭标签页后无遗留规则。

5. 实现 popup 状态反馈。
   - popup 查询当前 active tab，加载已保存列表，计算当前 URL 预览状态。
   - 保存后通知 background 重新刷新当前标签页规则。
   - 状态展示保持简洁：允许、已阻断、未命中。
   - 验证点：保存配置后，无需重新加载扩展，popup 状态和网络阻断行为能更新。

6. 添加 README 手动测试说明。
   - 说明如何从 `chrome://extensions` 加载解压扩展。
   - 说明如何构造黑名单、白名单测试用例。
   - 说明如何用 DevTools Network 面板观察被扩展阻断的请求。
   - 验证点：README 能指导另一个人独立完成手动验证。

## 验证计划

- 加载 `apps/url-network-guard-extension` 为解压扩展。
- 场景 1：当前 URL 命中黑名单，白名单为空。预期：该标签页页面发起的子资源和 fetch 请求被阻断。
- 场景 2：当前 URL 同时命中黑名单和白名单。预期：请求允许通过，且当前 tab 没有残留阻断规则。
- 场景 3：从黑名单 URL 跳转到无关 URL。预期：跳转后请求恢复允许。
- 场景 4：输入包含混合分隔符和重复 token。预期：解析结果无空值、无重复项。
- 场景 5：当前页为 `chrome://extensions` 或扩展 popup。预期：不安装阻断规则。

如后续在本仓库进入实现阶段：

- 因为第一版没有包配置、构建流程和站点产物，通常不需要运行 Vite+ 检查。
- 如果后续新增 package scripts、构建配置、生成文档或站点导航，再按仓库 Vite+ 指南执行对应检查。

## 风险

- 导航时序风险：MV3 service worker 需要在页面导航后判断 URL 并安装规则，极早发起的请求可能先于规则生效。如果要求“一个请求都不能漏”，需要重新评估更严格但更复杂的方案。
- service worker 生命周期风险：MV3 后台 worker 可能休眠，状态必须能从 `chrome.storage.local` 和当前 tab/session rules 中恢复。
- 规则清理风险：如果 tab 关闭或跳转后未清理规则，可能造成误阻断。实现时应使用稳定 rule id，并始终先 remove 再 add。
- DNR 数量限制风险：一条阻断规则对应一个被阻断 tab，通常风险较低，但仍应清理无效 tab 规则。
- “一切网络请求”的边界风险：DNR 能阻断标签页相关网络层请求，但不能回滚已经发出的请求，也不覆盖与该标签页无关的浏览器内部请求。

## TaskList

- [ ] 创建 `apps/url-network-guard-extension/manifest.json`。
- [ ] 创建包含黑名单和白名单 textarea 的 popup UI。
- [ ] 实现分隔符解析、去重和 storage 读写。
- [ ] 实现白名单优先的 URL 匹配状态判断。
- [ ] 实现 MV3 background service worker 事件监听。
- [ ] 实现按 tab 添加和移除 DNR session block rule。
- [ ] 在 popup 中展示当前标签页匹配状态。
- [ ] 添加 README 手动加载和验证步骤。
- [ ] 手动验证黑名单阻断、白名单覆盖、跳转清理和非网页 URL 行为。

## 交接说明

实现阶段建议使用 `axiom`、`kxh-awesome` 和 `code-spec` 技能。保持原生 HTML/CSS/JS，不引入框架、打包工具或 package metadata，除非用户明确扩大范围。
