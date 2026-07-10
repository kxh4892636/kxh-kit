# Huatuo Coverage APIs

本 reference 是 Huatuo 前端覆盖率 API 口径。只使用 `jsCoverage` API；不要调用 `codeScope` API 判断前端覆盖率。

## Host

```text
https://huatuo.bytedance.net
```

Huatuo 页面可能在 `https://ehome.bytedance.net/huatuo/...`，但当前环境里的前端请求会把 `/api/...` 转到 `https://huatuo.bytedance.net/api/...`。

## MR List

仅当 `repo` 未知时使用：

```text
GET /api/jsCoverage/mr?projectId={projectId}&limit=200&state={state}
```

`state` 通常是 `all`、`opened`、`merged` 或 `closed`。

常用字段：

```ts
{
  gitRepo?: string;
  projGitrepo?: string;
  mrId: string | number;
  title?: string;
  committors?: string;
  addLines?: number;
  insertLines?: number;
  coverLines?: number;
  coverRatio?: string;
}
```

## MR Files

读取 MR 整体覆盖率和文件级覆盖率：

```text
GET /api/jsCoverage/mr/files?gitRepo={repo}&mrId={mrId}&devicePlatform=&deviceModel=&appId=&appVersion=
```

带 filters：

```text
GET /api/jsCoverage/mr/files?gitRepo={repo}&mrId={mrId}&devicePlatform={devicePlatform}&deviceModel={deviceModel}&appId={appId}&appVersion={appVersion}
```

响应口径：

```ts
{
  status: 0;
  message: "ok";
  data: {
    mrId: string;
    gitRepo: string;
    title?: string;
    committors?: string;
    addLines: number;
    insertLines: number;
    coverLines: number;
    coverRatio: string;
    packageList: Array<{
      label: string;
      children: Array<{
        label: string;
        path: string;
        addLines: number;
        insertLines: number;
        coverLines: number;
        coverRatio: string;
        ignoreLines?: unknown[];
        ignoreReason?: string;
      }>;
    }>;
  };
}
```

## MR File Code

读取 MR 单文件行级覆盖率：

```text
GET /api/jsCoverage/mr/code?gitRepo={repo}&mrId={mrId}&devicePlatform=&deviceModel=&appId=&appVersion=&filePath={filePath}
```

`filePath` 不转义曾被验证可用；如果转义后的路径返回空数据，使用 raw path 重试。

响应可能是数组，也可能是 `data.lineCodes`：

```ts
{
  status: 0;
  message: "ok";
  data:
    | Array<{
        lineNum: number;
        code: string;
        isAddLine?: boolean;
        isInsertLine?: boolean;
        isCoverageLine?: boolean;
        isIgnoreLine?: boolean;
      }>
    | {
        lineCodes: Array<{
          lineNum: number;
          code: string;
          isAddLine?: boolean;
          isInsertLine?: boolean;
          isCoverageLine?: boolean;
          isIgnoreLine?: boolean;
        }>;
      };
}
```

## Branch List

解析 base branch，并确认 Huatuo 是否存在分支覆盖率记录：

```text
GET /api/jsCoverage/branch?projectId={projectId}&toBranch={branch}
```

`projectId` 从用户输入、Huatuo URL 或项目 profile 获取。常用字段：

```ts
{
  projGitrepo?: string;
  gitRepo?: string;
  fromBranch: string;
  toBranch: string;
  title?: string;
  addLines?: number;
  insertLines?: number;
  coverLines?: number;
  coverRatio?: string;
}
```

## Branch Files

读取分支整体覆盖率和文件级覆盖率：

```text
GET /api/jsCoverage/branch/files?gitRepo={repo}&fromBranch={fromBranch}&toBranch={branch}&devicePlatform=&deviceModel=&appId=&appVersion=
```

响应结构与 MR files 一致，但使用 `fromBranch`、`toBranch`，且可能包含 `commitIds`。

## Branch File Code

读取分支单文件行级覆盖率：

```text
GET /api/jsCoverage/branch/code?gitRepo={repo}&fromBranch={fromBranch}&toBranch={branch}&devicePlatform=&deviceModel=&appId=&appVersion=&filePath={filePath}
```

行级响应结构与 MR file code 一致。

## 行级分类

```ts
covered = isInsertLine && isCoverageLine && !isIgnoreLine;
uncovered = isInsertLine && !isCoverageLine && !isIgnoreLine;
addedOnly = isAddLine && !isInsertLine && !isCoverageLine && !isIgnoreLine;
ignored = isIgnoreLine;
```

覆盖率分母是 `insertLines`，不是 `addLines`。

## 认证

先尝试普通 GET。当前内网环境下，部分覆盖率接口可能无需显式 cookie 或 JWT 即返回 `status: 0`。

如果请求返回认证或权限错误：

1. 优先使用 `bytedcli --json insearch get <url>` 复用当前用户的 `bytecloud_jwt`。
2. 只有 bytedcli 认证不可用或过期时，才要求用户登录。
3. 最后才检查已渲染页面；能拿 API 数据时不依赖 DOM 颜色或 class。
