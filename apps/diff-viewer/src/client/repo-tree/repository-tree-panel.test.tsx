// 仓库树面板展示组件测试 (issue 04 重构为纯展示): 父子层级渲染、勾选/聚焦属性、
// 进度与错误文本、交互回调、无 bridge 降级。状态机行为见 use-repository-scan.test.tsx。
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DiffViewerBridge } from "../../api-bridge/api-bridge-types";
import type { RepositoryNode } from "../../types/repository";

import { RepositoryTreePanel } from "./repository-tree-panel";
import type { RepositoryScanState } from "./use-repository-scan";

const REPOSITORIES: RepositoryNode[] = [
  {
    path: "/ws",
    name: "ws",
    isSubmodule: false,
    children: [
      { path: "/ws/lib/nested", name: "nested", isSubmodule: false, children: [] },
      { path: "/ws/vendor/sub-lib", name: "sub-lib", isSubmodule: true, children: [] },
    ],
  },
];

const createScanState = (overrides: Partial<RepositoryScanState> = {}): RepositoryScanState => ({
  workspaceRoot: "/ws",
  repositories: REPOSITORIES,
  scanning: false,
  progress: null,
  error: null,
  checkedPaths: ["/ws"],
  activePath: "/ws",
  openFolder: vi.fn(async () => {}),
  toggleRepository: vi.fn(),
  activateRepository: vi.fn(async () => true),
  openRemote: vi.fn(async () => true),
  ...overrides,
});

const getRowCheckbox = (rowTestId: string): HTMLElement =>
  within(screen.getByTestId(rowTestId)).getByRole("checkbox");

describe("RepositoryTreePanel", () => {
  beforeEach(() => {
    // 面板的无 bridge 降级分支只探测 bridge 存在性, stub 一个空对象即可
    window.diffViewerBridge = {} as DiffViewerBridge;
  });

  afterEach(() => {
    delete window.diffViewerBridge;
  });

  it("按父子层级渲染仓库, 勾选与聚焦状态映射到行属性", () => {
    render(<RepositoryTreePanel scan={createScanState()} />);

    const rootNode = screen.getByTestId("repo-node-ws");
    expect(rootNode).toContainElement(screen.getByTestId("repo-node-nested"));
    expect(rootNode).toContainElement(screen.getByTestId("repo-node-sub-lib"));
    expect(screen.getByTestId("repo-node-sub-lib")).toHaveTextContent("submodule");

    expect(getRowCheckbox("repo-row-ws")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("repo-row-ws")).toHaveAttribute("data-active", "true");
    expect(getRowCheckbox("repo-row-nested")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("repo-row-nested")).toHaveAttribute("data-active", "false");
  });

  it("扫描中显示进度文本, 有错误时显示错误, 无仓库时空态提示", () => {
    const { rerender } = render(
      <RepositoryTreePanel
        scan={createScanState({
          scanning: true,
          progress: { scannedDirectories: 3, foundRepositories: 1, currentDirectory: "/ws/lib" },
        })}
      />,
    );
    expect(screen.getByTestId("scan-progress")).toHaveTextContent("3 dirs, 1 repos found");

    rerender(<RepositoryTreePanel scan={createScanState({ error: "scan broke" })} />);
    expect(screen.getByTestId("repository-tree-error")).toHaveTextContent("scan broke");

    rerender(<RepositoryTreePanel scan={createScanState({ repositories: [] })} />);
    expect(screen.getByText("No repositories found")).toBeInTheDocument();
  });

  it("点击勾选回调 toggleRepository, 打开目录按钮回调 openFolder", () => {
    const scan = createScanState();
    render(<RepositoryTreePanel scan={scan} />);

    fireEvent.click(getRowCheckbox("repo-row-nested"));
    expect(scan.toggleRepository).toHaveBeenCalledWith("/ws/lib/nested");

    fireEvent.click(screen.getByTestId("open-folder-button"));
    expect(scan.openFolder).toHaveBeenCalledTimes(1);
  });

  it("bridge 不存在 (纯浏览器环境) 时降级为不可用提示", () => {
    delete window.diffViewerBridge;
    render(<RepositoryTreePanel scan={createScanState()} />);
    expect(screen.getByTestId("repository-tree-unavailable")).toBeInTheDocument();
  });
});
