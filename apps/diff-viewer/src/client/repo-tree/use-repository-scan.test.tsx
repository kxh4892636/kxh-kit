// 仓库扫描状态机测试 (issue 03 移植自原面板组件测试, 04 上提 App 后直接测 hook):
// 挂载自动扫描、根仓库自动勾选不重复激活、勾选激活/取消回退、
// 取消最后一个保持聚焦 (04 取舍)、打开目录重扫、激活失败错误、跨仓库聚焦;
// issue 06: openRemote 连接远程 (成功换树/失败保留/使在途扫描失效)。
// bridge (window.diffViewerBridge) 全部 stub, 不经真实 IPC。
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DiffViewerBridge } from "../../api-bridge/api-bridge-types";
import type { RepositoryScanResult, ScanProgress } from "../../types/repository";

import { useRepositoryScan } from "./use-repository-scan";

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

// issue 06: 远程扫描结果的节点 path 即 ssh:// 会话键 (与主进程 remote-repo-scanner 约定一致)
const REMOTE_RESULT: RepositoryScanResult = {
  rootPath: "ssh://fake-host/remote/ws",
  scannedDirectories: 3,
  repositories: [
    {
      path: "ssh://fake-host/remote/ws",
      name: "ws",
      isSubmodule: false,
      children: [
        {
          path: "ssh://fake-host/remote/ws/lib/nested-lib",
          name: "nested-lib",
          isSubmodule: false,
          children: [],
        },
      ],
    },
  ],
};

const createBridgeStub = (overrides: Partial<DiffViewerBridge> = {}): DiffViewerBridge => ({
  invokeApi: vi.fn(),
  openWatch: vi.fn(),
  onWatchEvent: vi.fn(() => () => {}),
  getWorkspace: vi.fn(async () => ({ rootPath: "/ws" })),
  pickDirectory: vi.fn(async () => null),
  scanRepositories: vi.fn(async () => SCAN_RESULT),
  onScanProgress: vi.fn(() => () => {}),
  connectSsh: vi.fn(),
  listSshConnections: vi.fn(async () => []),
  ...overrides,
});

const onActivateNoop = vi.fn(async () => true);

describe("useRepositoryScan", () => {
  beforeEach(() => {
    window.diffViewerBridge = createBridgeStub();
  });

  afterEach(() => {
    delete window.diffViewerBridge;
  });

  it("挂载后自动扫描启动目录, 根仓库自动勾选并激活 (04: 幂等激活, 使 App 记录聚焦仓库)", async () => {
    const onActivate = vi.fn(async () => true);
    const { result } = renderHook(() => useRepositoryScan({ onActivateRepository: onActivate }));

    await waitFor(() => expect(result.current.repositories).toHaveLength(1));
    expect(result.current.workspaceRoot).toBe("/ws");
    expect(result.current.checkedPaths).toEqual(["/ws"]);
    await waitFor(() => expect(result.current.activePath).toBe("/ws"));
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith("/ws");
  });

  it("扫描期间暴露进度, 完成后清空", async () => {
    let progressCallback: ((scanId: string, progress: ScanProgress) => void) | null = null;
    let resolveScan: ((scanResult: RepositoryScanResult) => void) | null = null;
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
    const { result } = renderHook(() =>
      useRepositoryScan({ onActivateRepository: onActivateNoop }),
    );

    await waitFor(() => expect(result.current.scanning).toBe(true));
    act(() => {
      progressCallback?.("scan-1", {
        scannedDirectories: 3,
        foundRepositories: 1,
        currentDirectory: "/ws/lib",
      });
    });
    expect(result.current.progress).toMatchObject({ scannedDirectories: 3 });

    await act(async () => {
      resolveScan?.(SCAN_RESULT);
    });
    await waitFor(() => expect(result.current.scanning).toBe(false));
    expect(result.current.progress).toBeNull();
    expect(result.current.repositories).toHaveLength(1);
  });

  it("勾选子仓库激活之; 取消勾选聚焦仓库回退到最近一个仍勾选的仓库", async () => {
    const onActivate = vi.fn(async () => true);
    const { result } = renderHook(() => useRepositoryScan({ onActivateRepository: onActivate }));
    await waitFor(() => expect(result.current.repositories).toHaveLength(1));

    act(() => result.current.toggleRepository("/ws/lib/nested"));
    await waitFor(() => expect(result.current.activePath).toBe("/ws/lib/nested"));
    expect(onActivate).toHaveBeenCalledWith("/ws/lib/nested");
    expect(result.current.checkedPaths).toEqual(["/ws", "/ws/lib/nested"]);

    act(() => result.current.toggleRepository("/ws/lib/nested"));
    await waitFor(() => expect(result.current.activePath).toBe("/ws"));
    expect(onActivate).toHaveBeenLastCalledWith("/ws");
    expect(result.current.checkedPaths).toEqual(["/ws"]);
  });

  // 04 取舍: 取消最后一个勾选时保持当前聚焦与 diff 视图, 不清空内容
  it("取消勾选最后一个仓库时保持聚焦, 不再触发激活", async () => {
    const onActivate = vi.fn(async () => true);
    const { result } = renderHook(() => useRepositoryScan({ onActivateRepository: onActivate }));
    await waitFor(() => expect(result.current.checkedPaths).toEqual(["/ws"]));
    await waitFor(() => expect(result.current.activePath).toBe("/ws"));
    onActivate.mockClear();

    act(() => result.current.toggleRepository("/ws"));
    expect(result.current.checkedPaths).toEqual([]);
    expect(result.current.activePath).toBe("/ws");
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("打开目录: 选择新目录后勾选重置并重扫, 自动激活新根仓库; 取消选择则保持现状", async () => {
    const pickDirectory = vi.fn(async (): Promise<string | null> => "/elsewhere");
    const scanRepositories = vi.fn(async (_scanId: string, rootPath: string) =>
      rootPath === "/ws" ? SCAN_RESULT : ELSEWHERE_RESULT,
    );
    const onActivate = vi.fn(async () => true);
    window.diffViewerBridge = createBridgeStub({ pickDirectory, scanRepositories });
    const { result } = renderHook(() => useRepositoryScan({ onActivateRepository: onActivate }));
    await waitFor(() => expect(result.current.repositories).toHaveLength(1));

    // 先勾选 nested, 验证打开新目录后勾选不跨目录保留
    act(() => result.current.toggleRepository("/ws/lib/nested"));
    await waitFor(() => expect(result.current.activePath).toBe("/ws/lib/nested"));

    await act(async () => {
      await result.current.openFolder();
    });
    expect(scanRepositories).toHaveBeenLastCalledWith(expect.any(String), "/elsewhere");
    expect(result.current.checkedPaths).toEqual(["/elsewhere"]);
    expect(onActivate).toHaveBeenLastCalledWith("/elsewhere");
    expect(result.current.activePath).toBe("/elsewhere");

    // 取消选择: 不再发起新扫描
    pickDirectory.mockResolvedValueOnce(null);
    const callCount = scanRepositories.mock.calls.length;
    await act(async () => {
      await result.current.openFolder();
    });
    expect(scanRepositories).toHaveBeenCalledTimes(callCount);
  });

  it("激活失败时设置错误且聚焦不变", async () => {
    const onActivate = vi.fn(async () => false);
    const { result } = renderHook(() => useRepositoryScan({ onActivateRepository: onActivate }));
    await waitFor(() => expect(result.current.checkedPaths).toEqual(["/ws"]));

    act(() => result.current.toggleRepository("/ws/lib/nested"));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.activePath).toBe("/ws");
  });

  it("activateRepository 跨仓库聚焦: 不改勾选状态, 激活成功后同步聚焦高亮", async () => {
    const onActivate = vi.fn(async () => true);
    const { result } = renderHook(() => useRepositoryScan({ onActivateRepository: onActivate }));
    await waitFor(() => expect(result.current.checkedPaths).toEqual(["/ws"]));

    act(() => result.current.toggleRepository("/ws/lib/nested"));
    await waitFor(() => expect(result.current.activePath).toBe("/ws/lib/nested"));

    let succeeded: boolean | undefined;
    await act(async () => {
      succeeded = await result.current.activateRepository("/ws");
    });
    expect(succeeded).toBe(true);
    expect(onActivate).toHaveBeenLastCalledWith("/ws");
    expect(result.current.activePath).toBe("/ws");
    expect(result.current.checkedPaths).toEqual(["/ws", "/ws/lib/nested"]);
  });

  // issue 06: 连接远程 = 新工作上下文, 语义与 openFolder 换目录一致 (勾选不跨上下文保留)
  it("openRemote 连接成功: 替换仓库树, 勾选重置, 自动勾选并激活远程根仓库", async () => {
    const connectSsh = vi.fn(async () => REMOTE_RESULT);
    const onActivate = vi.fn(async () => true);
    window.diffViewerBridge = createBridgeStub({ connectSsh });
    const { result } = renderHook(() => useRepositoryScan({ onActivateRepository: onActivate }));
    await waitFor(() => expect(result.current.repositories).toHaveLength(1));

    // 先勾选 nested, 验证连接远程后勾选不跨上下文保留
    act(() => result.current.toggleRepository("/ws/lib/nested"));
    await waitFor(() => expect(result.current.activePath).toBe("/ws/lib/nested"));

    let succeeded: boolean | undefined;
    await act(async () => {
      succeeded = await result.current.openRemote("fake-host", "/remote/ws");
    });
    expect(succeeded).toBe(true);
    expect(connectSsh).toHaveBeenCalledWith({ target: "fake-host", path: "/remote/ws" });
    expect(result.current.workspaceRoot).toBe("ssh://fake-host/remote/ws");
    expect(result.current.repositories[0]?.path).toBe("ssh://fake-host/remote/ws");
    expect(result.current.checkedPaths).toEqual(["ssh://fake-host/remote/ws"]);
    expect(onActivate).toHaveBeenLastCalledWith("ssh://fake-host/remote/ws");
    expect(result.current.activePath).toBe("ssh://fake-host/remote/ws");
    expect(result.current.error).toBeNull();
  });

  it("openRemote 连接失败: 保留现有树与勾选, 暴露错误信息, 返回 false", async () => {
    const connectSsh = vi.fn(async (): Promise<RepositoryScanResult> => {
      throw new Error("ssh: connect to host bad-host port 22: Connection refused");
    });
    const onActivate = vi.fn(async () => true);
    window.diffViewerBridge = createBridgeStub({ connectSsh });
    const { result } = renderHook(() => useRepositoryScan({ onActivateRepository: onActivate }));
    await waitFor(() => expect(result.current.checkedPaths).toEqual(["/ws"]));

    let succeeded: boolean | undefined;
    await act(async () => {
      succeeded = await result.current.openRemote("bad-host", "/remote/ws");
    });
    expect(succeeded).toBe(false);
    expect(result.current.error).toContain("Connection refused");
    expect(result.current.workspaceRoot).toBe("/ws");
    expect(result.current.checkedPaths).toEqual(["/ws"]);
    expect(result.current.activePath).toBe("/ws");
  });

  it("onActivateRepository 身份变化不触发重扫 (issue 01: ignoreWhitespace 切换经 App 回调链传导, 启动扫描只应在挂载时运行一次)", async () => {
    const getWorkspace = vi.fn(async () => ({ rootPath: "/ws" }));
    const scanRepositories = vi.fn(async () => SCAN_RESULT);
    window.diffViewerBridge = createBridgeStub({ getWorkspace, scanRepositories });
    const { result, rerender } = renderHook(
      ({ onActivate }) => useRepositoryScan({ onActivateRepository: onActivate }),
      { initialProps: { onActivate: vi.fn(async () => true) } },
    );
    await waitFor(() => expect(result.current.checkedPaths).toEqual(["/ws"]));
    await waitFor(() => expect(result.current.activePath).toBe("/ws"));
    expect(scanRepositories).toHaveBeenCalledTimes(1);

    // App 中 ignoreWhitespace 切换 → fetchDiffData → handleActivateRepository 重建,
    // 宿主每次渲染传入新身份的回调; 不得因此重启启动扫描
    rerender({ onActivate: vi.fn(async () => true) });
    await act(async () => {});

    expect(getWorkspace).toHaveBeenCalledTimes(1);
    expect(scanRepositories).toHaveBeenCalledTimes(1);
    expect(result.current.repositories).toHaveLength(1);
    expect(result.current.checkedPaths).toEqual(["/ws"]);
    expect(result.current.activePath).toBe("/ws");
  });

  it("openRemote 使在途的本地扫描失效 (后到的旧扫描结果不得覆盖远程树)", async () => {
    let resolveStaleScan: ((scanResult: RepositoryScanResult) => void) | null = null;
    const scanRepositories = vi.fn(
      () =>
        new Promise<RepositoryScanResult>((resolvePromise) => {
          resolveStaleScan = resolvePromise;
        }),
    );
    const connectSsh = vi.fn(async () => REMOTE_RESULT);
    window.diffViewerBridge = createBridgeStub({ scanRepositories, connectSsh });
    const { result } = renderHook(() =>
      useRepositoryScan({ onActivateRepository: onActivateNoop }),
    );
    await waitFor(() => expect(result.current.scanning).toBe(true));

    await act(async () => {
      await result.current.openRemote("fake-host", "/remote/ws");
    });
    expect(result.current.workspaceRoot).toBe("ssh://fake-host/remote/ws");

    // 旧扫描随后才返回: 序列号已失效, 结果必须被丢弃
    await act(async () => {
      resolveStaleScan?.(SCAN_RESULT);
    });
    expect(result.current.workspaceRoot).toBe("ssh://fake-host/remote/ws");
    expect(result.current.scanning).toBe(false);
  });
});
