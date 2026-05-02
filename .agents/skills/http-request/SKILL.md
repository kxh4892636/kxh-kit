---
name: http-request
description: 前端接口请求规范，用于编写 HTTP 接口请求代码. 在执行 BAM 接口, HTTP 接口请求, 网络请求, 第三方数据接入任务时使用该 skill.
---

# http-request

## 规则

- 优先使用 BAM 调用接口, 只有在缺少对应 API 或临时接入时才使用 `request(...)/fetch` 调用 HTTP 接口;
- 搜索同一项目中的网络请求函数, 仿照其实现方式;

## 请求流程

1. 使用 BAM 或者 request(...)/fetch() 封装 HTTP 接口请求函数;
2. 基于封装后的请求函数, 使用 `ahook` 或者 `react-query` 生成对应的 hook;
3. 在组件中使用 hook 来调用接口;

## hook 示例

### 规则

- 使用 try-catch 包裹请求函数, 并在 catch 中使用 console.error 记录异常, 并返回与返回值类型相同的空值;
- 至少返回 `data`, `loading`, `error` 三个属性;
- 明确 hook 的参数和返回值类型;

### react-query

```tsx
export const useGetCaseList = (params: CaseItemEnumReq) => {
  const { data, loading, error } = useQuery({
    queryKey: ["case", params],
    queryFn: async () => {
      try {
        const res = await getCaseList(params);
        return res?.case_list || [];
      } catch (error) {
        console.error("getCaseList error", error);
        return [];
      }
    },
  });

  return {
    data,
    loading,
    error,
  };
};
```

### ahook

```tsx
import { GetItemList } from "@govern-public/api-ippro";
import { useRequest } from "ahooks";

export const useGetItemList = (params: GetItemListReq) => {
  const { data, loading, error } = useRequest(() => {
    try {
      return GetItemList(params) || [];
    } catch (error) {
      console.error("getItemList error", error);
      return [];
    }
  });

  return {
    data,
    loading,
    error,
  };
};
```