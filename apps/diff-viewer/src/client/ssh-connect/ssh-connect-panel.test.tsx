// SSH 连接面板测试 (issue 06): 折叠/展开、历史列表加载与点击回填直连、
// 表单校验 (空输入不提交)、连接失败错误展示、连接中禁用提交。
// bridge 与 scan 状态机全部 stub, 不经真实 IPC/网络。
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DiffViewerBridge } from "../../api-bridge/api-bridge-types";
import type { SshConnectionEntry } from "../../types/ssh";

import type { RepositoryScanState } from "../repo-tree/use-repository-scan";

import { SshConnectPanel } from "./ssh-connect-panel";

const HISTORY: SshConnectionEntry[] = [
  { target: "dev-box", path: "/srv/repos", lastUsedAt: "2026-08-15T10:00:00.000Z" },
  { target: "root@123.57.92.26", path: "/opt/app", lastUsedAt: "2026-08-14T09:00:00.000Z" },
];

const createScanStub = (overrides: Partial<RepositoryScanState> = {}): RepositoryScanState => ({
  workspaceRoot: "/ws",
  repositories: [],
  scanning: false,
  progress: null,
  error: null,
  checkedPaths: [],
  activePath: null,
  openFolder: vi.fn(async () => {}),
  toggleRepository: vi.fn(),
  activateRepository: vi.fn(async () => true),
  openRemote: vi.fn(async () => true),
  ...overrides,
});

const createBridgeStub = (overrides: Partial<DiffViewerBridge> = {}): DiffViewerBridge => ({
  invokeApi: vi.fn(),
  openWatch: vi.fn(),
  onWatchEvent: vi.fn(() => () => {}),
  getWorkspace: vi.fn(async () => ({ rootPath: "/ws" })),
  pickDirectory: vi.fn(async () => null),
  scanRepositories: vi.fn(),
  onScanProgress: vi.fn(() => () => {}),
  connectSsh: vi.fn(),
  listSshConnections: vi.fn(async () => HISTORY),
  ...overrides,
});

describe("SshConnectPanel", () => {
  beforeEach(() => {
    window.diffViewerBridge = createBridgeStub();
  });

  afterEach(() => {
    delete window.diffViewerBridge;
  });

  it("默认折叠; 点击 toggle 展开表单并加载历史连接", async () => {
    render(<SshConnectPanel scan={createScanStub()} />);
    expect(screen.queryByTestId("ssh-target-input")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("ssh-connect-toggle"));
    expect(screen.getByTestId("ssh-target-input")).toBeInTheDocument();
    expect(screen.getByTestId("ssh-path-input")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId("ssh-history-list")).toBeInTheDocument());
    expect(screen.getByTestId("ssh-history-list")).toHaveTextContent("dev-box");
    expect(screen.getByTestId("ssh-history-list")).toHaveTextContent("root@123.57.92.26");
  });

  it("空 target 或空 path 不发起连接", () => {
    const scan = createScanStub();
    render(<SshConnectPanel scan={scan} />);
    fireEvent.click(screen.getByTestId("ssh-connect-toggle"));

    fireEvent.click(screen.getByTestId("ssh-connect-submit"));
    expect(scan.openRemote).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId("ssh-target-input"), { target: { value: "dev-box" } });
    fireEvent.click(screen.getByTestId("ssh-connect-submit"));
    expect(scan.openRemote).not.toHaveBeenCalled();
  });

  it("提交合法输入调用 openRemote; 成功后收起面板", async () => {
    const scan = createScanStub();
    render(<SshConnectPanel scan={scan} />);
    fireEvent.click(screen.getByTestId("ssh-connect-toggle"));

    fireEvent.change(screen.getByTestId("ssh-target-input"), { target: { value: " dev-box " } });
    fireEvent.change(screen.getByTestId("ssh-path-input"), { target: { value: "/srv/repos" } });
    fireEvent.click(screen.getByTestId("ssh-connect-submit"));

    await waitFor(() => expect(scan.openRemote).toHaveBeenCalledWith("dev-box", "/srv/repos"));
    await waitFor(() => expect(screen.queryByTestId("ssh-target-input")).not.toBeInTheDocument());
  });

  it("连接失败显示错误信息, 面板保持展开", async () => {
    const scan = createScanStub({
      openRemote: vi.fn(async () => false),
      error: "ssh: connect to host bad-host port 22: Connection refused",
    });
    render(<SshConnectPanel scan={scan} />);
    fireEvent.click(screen.getByTestId("ssh-connect-toggle"));

    fireEvent.change(screen.getByTestId("ssh-target-input"), { target: { value: "bad-host" } });
    fireEvent.change(screen.getByTestId("ssh-path-input"), { target: { value: "/srv/repos" } });
    fireEvent.click(screen.getByTestId("ssh-connect-submit"));

    await waitFor(() => expect(scan.openRemote).toHaveBeenCalled());
    expect(screen.getByTestId("ssh-connect-error")).toHaveTextContent("Connection refused");
    expect(screen.getByTestId("ssh-target-input")).toBeInTheDocument();
  });

  it("点击历史条目回填表单并直接发起连接", async () => {
    const scan = createScanStub();
    render(<SshConnectPanel scan={scan} />);
    fireEvent.click(screen.getByTestId("ssh-connect-toggle"));
    await waitFor(() => expect(screen.getByTestId("ssh-history-list")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("ssh-history-entry-0"));
    expect(screen.getByTestId("ssh-target-input")).toHaveValue("dev-box");
    expect(screen.getByTestId("ssh-path-input")).toHaveValue("/srv/repos");
    await waitFor(() => expect(scan.openRemote).toHaveBeenCalledWith("dev-box", "/srv/repos"));
  });

  it("连接中 (scanning) 禁用提交按钮", () => {
    const scan = createScanStub({ scanning: true });
    render(<SshConnectPanel scan={scan} />);
    fireEvent.click(screen.getByTestId("ssh-connect-toggle"));
    expect(screen.getByTestId("ssh-connect-submit")).toBeDisabled();
  });
});
