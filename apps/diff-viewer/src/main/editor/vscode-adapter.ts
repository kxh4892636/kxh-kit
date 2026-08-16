// VSCode 编辑器适配器 (issue 07): 经 vscode://file/<绝对路径>[:行号] 协议打开
// 并定位行号。选协议而非 `code -g` CLI: 两者都是 issue 允许的形态, 协议零 spawn
// 依赖、跨平台行为一致 (win32 的 code 是 .cmd shim, Node 18.20+/20.12+ 起无 shell
// 无法直接启动); 协议定位行号有官方支持。打开动作经注入的 openExternal
// (electron shell.openExternal), 适配器不依赖 electron 便于单测。
import type { EditorAdapter, EditorOpenResult, OpenInEditorTarget } from "./editor-adapter.js";

export interface VscodeEditorAdapterOptions {
  // 打开外部协议 URL (electron shell.openExternal); 未注入时适配器不可用
  openExternal?: (url: string) => Promise<unknown>;
}

// Windows 绝对路径的反斜杠归一为正斜杠 (C:\a\b → C:/a/b);
// POSIX 路径以 / 开头, 拼在 file/ 后自然形成双斜杠 (file//home/...), 符合官方格式
export const buildVscodeFileUrl = (absolutePath: string, line?: number): string => {
  const normalized = absolutePath.replaceAll("\\", "/");
  return `vscode://file/${normalized}${line === undefined ? "" : `:${line}`}`;
};

export const createVscodeEditorAdapter = (options: VscodeEditorAdapterOptions): EditorAdapter => ({
  id: "vscode",
  isAvailable: () => options.openExternal !== undefined,
  open: async (target: OpenInEditorTarget): Promise<EditorOpenResult> => {
    if (options.openExternal === undefined) {
      return { ok: false, error: "Open in editor is not available in this build" };
    }
    const url = buildVscodeFileUrl(target.absolutePath, target.line);
    try {
      await options.openExternal(url);
      return { ok: true, url };
    } catch (error) {
      console.error(`Failed to open ${url} via OS handler:`, error);
      return { ok: false, error: "Failed to open file in editor" };
    }
  },
});
