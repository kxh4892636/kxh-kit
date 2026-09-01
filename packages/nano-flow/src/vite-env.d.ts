interface ImportMetaGlobOptions {
  readonly eager?: boolean;
  readonly import?: string;
  readonly query?: string;
}

interface ImportMeta {
  glob<T = unknown>(
    pattern: string,
    options: ImportMetaGlobOptions & { readonly eager: true },
  ): Record<string, T>;
  glob(pattern: string, options?: ImportMetaGlobOptions): Record<string, () => Promise<unknown>>;
}
