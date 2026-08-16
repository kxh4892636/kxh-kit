// 编辑器打开接缝 (issue 07): 按编辑器 id 收敛打开机制, v1 仅注册 VSCode
// (vscode-adapter.ts), 后续 cursor/trae 以同形适配器扩展。
// 适配器只做机制 (构造协议 URL 并经注入的 openExternal 打开); 路径穿越校验、
// 仓库相对路径拼接与编辑器选择的策略判断都在路由层 (api-router.ts) 完成。
export interface OpenInEditorTarget {
  // 仓库内已解析的绝对路径 (路由层已完成穿越校验与拼接)
  absolutePath: string;
  // 可选正整数行号; 缺省时只打开文件不定位
  line?: number;
}

export type EditorOpenResult = { ok: true; url: string } | { ok: false; error: string };

export interface EditorAdapter {
  readonly id: string;
  // 同步可用性判断 (注入缺失即不可用); 结果进 /api/diff 的 openInEditorAvailable
  isAvailable: () => boolean;
  // 实现方契约: 所有失败必须自行捕获并以 EditorOpenResult 返回, 不得抛错穿透到路由层
  open: (target: OpenInEditorTarget) => Promise<EditorOpenResult>;
}
