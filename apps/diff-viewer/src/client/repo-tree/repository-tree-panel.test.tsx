// 仓库树面板组件测试 (issue 03): 挂载自动扫描、进度可见、父子层级渲染、
// 勾选激活/取消回退、打开目录重扫、激活失败提示、无 bridge 降级。
// bridge (window.diffViewerBridge) 在此全部 stub, 不经真实 IPC。
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DiffViewerBridge } from "../../api-bridge/api-bridge-types";
import type { RepositoryScanResult, ScanProgress } from "../../types/repository";

import { RepositoryTreePanel } from "./repository-tree-panel";

const SCAN_RESULT: RepositoryScanResult = {
  rootPath: "/ws",
  scannedDirectories: 6,
  repositories: [
    {
      path: "/ws",
      name: "ws",
      isSubmodule: false,
      children: [
        { path: "/ws/lib/nested", name: "nested", isSubmodule: false, children: [] },
        { path: "/ws/vendor/sub-lib", name: "sub-lib", isSubmodule: true, children: [] },
      ],
    },
  ],
};

const ELSEWHERE_RESULT: RepositoryScanResult = {
  rootPath: "/elsewhere",
  scannedDirectories: 2,
  repositories: [{ path: "/elsewhere", name: "elsewhere", isSubmodule: false, children: [] }],
};

const createBridgeStub = (overrides: Partial<DiffViewerBridge> = {}): DiffViewerBridge => ({
  invokeApi: vi.fn(),
  openWatch: vi.fn(),
  onWatchEvent: vi.fn(() => () => {}),
  getWorkspace: vi.fn(async () => ({ rootPath: "/ws" })),
  pickDirectory: vi.fn(async () => null),
  scanRepositories: vi.fn(async () => SCAN_RESULT),
  onScanProgress: vi.fn(() => () => {}),
  ...overrides,
});

const getRowCheckbox = (rowTestId: string): HTMLElement =>
  within(screen.getByTestId(rowTestId)).getByRole("checkbox");

describe("RepositoryTreePanel", () => {
  beforeEach(() => {
    window.diffViewerBridge = createBridgeStub();
  });

  afterEach(() => {
    delete window.diffViewerBridge;
  });

  it("挂载后自动扫描启动目录, 仓库按父子层级展示, 根仓库自动勾选且不重复激活", async () => {
    const onActivate = vi.fn(async () => true);
    render(<RepositoryTreePanel onActivateRepository={onActivate} />);

    await screen.findByTestId("repo-node-nested");

    // 父子层级: nested/sub-lib 都是根节点 ws 的后代
    const rootNode = screen.getByTestId("repo-node-ws");
    expect(rootNode).toContainElement(screen.getByTestId("repo-node-nested"));
    expect(rootNode).toContainElement(screen.getByTestId("repo-node-sub-lib"));
    // submodule 形态可见
    expect(screen.getByTestId("repo-node-sub-lib")).toHaveTextContent("submodule");
    // 根仓库自动勾选; 它已是激活仓库 (启动目录), 不再触发切换
    expect(getRowCheckbox("repo-row-ws")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("repo-row-ws")).toHaveAttribute("data-active", "true");
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("扫描期间显示进度, 完成后隐藏", async () => {
    let progressCallback: ((scanId: string, progress: ScanProgress) => void) | null = null;
    let resolveScan: ((result: RepositoryScanResult) => void) | null = null;
    window.diffViewerBridge = createBridgeStub({
      scanRepositories: vi.fn(
        () =>
          new Promise<RepositoryScanResult>((resolvePromise) => {
            resolveScan = resolvePromise;
          }),
      ),
      onScanProgress: vi.fn((callback) => {
        progressCallback = callback;
        return () => {};
      }),
    });
    render(<RepositoryTreePanel onActivateRepository={vi.fn(async () => true)} />);

    // 扫描开始 (订阅发生) 后推一条进度事件
    await waitFor(() => expect(progressCallback).not.toBeNull());
    act(() => {
      progressCallback?.("scan-1", {
        scannedDirectories: 3,
        foundRepositories: 1,
        currentDirectory: "/ws/lib",
      });
    });
    await screen.findByTestId("scan-progress");
    expect(screen.getByTestId("scan-progress")).toHaveTextContent("3");
    expect(screen.getByTestId("scan-progress")).toHaveTextContent("1");

    await act(async () => {
      resolveScan?.(SCAN_RESULT);
    });
    await screen.findByTestId("repo-node-ws");
    await waitFor(() => expect(screen.queryByTestId("scan-progress")).not.toBeInTheDocument());
  });

  it("勾选子仓库激活其 diff; 取消勾选激活仓库回退到上一个勾选仓库", async () => {
    const onActivate = vi.fn(async () => true);
    render(<RepositoryTreePanel onActivateRepository={onActivate} />);
    await screen.findByTestId("repo-node-nested");

    fireEvent.click(getRowCheckbox("repo-row-nested"));
    await waitFor(() => expect(onActivate).toHaveBeenCalledWith("/ws/lib/nested"));
    await waitFor(() =>
      expect(screen.getByTestId("repo-row-nested")).toHaveAttribute("data-active", "true"),
    );
    expect(getRowCheckbox("repo-row-nested")).toHaveAttribute("aria-checked", "true");

    // 取消勾选当前激活的 nested → 回退到仍勾选的根仓库
    fireEvent.click(getRowCheckbox("repo-row-nested"));
    await waitFor(() => expect(onActivate).toHaveBeenCalledWith("/ws"));
    await waitFor(() =>
      expect(screen.getByTestId("repo-row-ws")).toHaveAttribute("data-active", "true"),
    );
  });

  it("打开目录流程: 选择新目录后重扫并自动激活新根仓库; 取消选择则保持现状", async () => {
    const pickDirectory = vi.fn(async (): Promise<string | null> => "/elsewhere");
    const scanRepositories = vi.fn(async (_scanId: string, rootPath: string) =>
      rootPath === "/ws" ? SCAN_RESULT : ELSEWHERE_RESULT,
    );
    const onActivate = vi.fn(async () => true);
    window.diffViewerBridge = createBridgeStub({ pickDirectory, scanRepositories });
    render(<RepositoryTreePanel onActivateRepository={onActivate} />);
    await screen.findByTestId("repo-node-nested");

    fireEvent.click(screen.getByTestId("open-folder-button"));
    await screen.findByTestId("repo-node-elsewhere");
    expect(scanRepositories).toHaveBeenLastCalledWith(expect.any(String), "/elsewhere");
    // 新目录的根仓库与当前激活不同 → 自动切换
    await waitFor(() => expect(onActivate).toHaveBeenCalledWith("/elsewhere"));

    // 取消选择: 不再发起新扫描
    pickDirectory.mockResolvedValueOnce(null);
    const callCount = scanRepositories.mock.calls.length;
    fireEvent.click(screen.getByTestId("open-folder-button"));
    await waitFor(() => expect(pickDirectory).toHaveBeenCalledTimes(2));
    expect(scanRepositories).toHaveBeenCalledTimes(callCount);
  });

  it("激活失败时显示错误且不切换高亮", async () => {
    const onActivate = vi.fn(async () => false);
    render(<RepositoryTreePanel onActivateRepository={onActivate} />);
    await screen.findByTestId("repo-node-nested");

    fireEvent.click(getRowCheckbox("repo-row-nested"));
    await screen.findByTestId("repository-tree-error");
    expect(screen.getByTestId("repo-row-ws")).toHaveAttribute("data-active", "true");
  });

  it("bridge 不存在 (纯浏览器环境) 时降级为不可用提示", () => {
    delete window.diffViewerBridge;
    render(<RepositoryTreePanel onActivateRepository={vi.fn(async () => true)} />);
    expect(screen.getByTestId("repository-tree-unavailable")).toBeInTheDocument();
  });
});
