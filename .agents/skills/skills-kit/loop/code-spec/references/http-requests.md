# HTTP Requests

读取本文件处理接口请求、请求函数封装、React hook 封装和请求库选择。涉及 TanStack Query 复杂缓存、SSR、Suspense 或乐观更新时，再读取 `references/react-query/README.md`。

## 选择顺序

1. 优先使用 ConnectRPC 生成的调用接口。
2. 其次使用 BAM 调用接口。
3. 只有缺少对应 API 或临时接入时才使用 `request(...)/fetch` 调用 HTTP 接口。
4. 搜索同一项目中的网络请求函数，仿照现有实现方式。

## 请求流程

1. 使用 ConnectRPC、BAM、`request(...)` 或 `fetch()` 封装 HTTP 接口请求函数。
2. 基于封装后的请求函数，使用 `ahook` 或 `react-query` 生成对应 hook。
3. 在组件中使用 hook 调用接口。

## hook 规则

- 请求函数使用 `try-catch` 包裹。
- `catch` 中使用 `console.error` 记录异常。
- 返回值需要与声明类型一致；需要向 React Query 传递错误时重新抛出。
- 明确 hook 的参数和返回值类型。

## react-query 示例

```tsx
export const useGetCaseList = (params: CaseItemEnumReq) => {
  const caseQueryClient = useQuery({
    queryKey: ["case", params],
    queryFn: async () => {
      try {
        const res = await getCaseList(params);
        return res?.case_list || [];
      } catch (error) {
        console.error("getCaseList error", error);
        throw error;
      }
    },
  });

  return {
    ...caseQueryClient,
  };
};
```

## ahook 示例

```tsx
import { GetItemList } from "@govern-public/api-ippro";
import { useRequest } from "ahooks";

export const useGetItemList = (params: GetItemListReq) => {
  const requestClient = useRequest(() => {
    try {
      return GetItemList(params) || [];
    } catch (error) {
      console.error("getItemList error", error);
      throw error;
    }
  });

  return {
    ...requestClient,
  };
};
```

## ConnectRPC 示例

```tsx
import { useQuery } from "@tanstack/react-query";
import { postsClient } from "../api/client";

export const usePosts = (random = true) => {
  const query = useQuery({
    queryKey: ["posts", random],
    queryFn: () => {
      try {
        return postsClient.getPosts({ random });
      } catch (error) {
        console.error("getPosts error", error);
        throw error;
      }
    },
  });
  const { data, ...rest } = query;

  return {
    ...rest,
    data: data?.posts,
  };
};
```
