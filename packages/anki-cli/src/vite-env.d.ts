// import.meta.glob 类型声明: 命令组自动发现的构建期接口。
// 本包不直接依赖 vite, 故不引 vite/client, 只声明用到的两个签名。
interface ImportMetaGlobOptions {
  eager?: boolean;
  import?: string;
  query?: string;
}

interface ImportMeta {
  glob<T = unknown>(
    pattern: string,
    options: ImportMetaGlobOptions & { eager: true },
  ): Record<string, T>;
  glob(pattern: string, options?: ImportMetaGlobOptions): Record<string, () => Promise<unknown>>;
}
