// 嵌套仓库扫描 (issue 03) 的共享传输类型: 主进程扫描器产出,
// 经 preload bridge 传给 renderer 的仓库树面板。
export interface RepositoryNode {
  // 绝对路径 (已 resolve), 作为树的稳定标识
  path: string;
  // 目录 basename, 侧栏展示用
  name: string;
  // .git 为 gitfile 文件 (submodule 检出形态) 时为 true; .git 为目录时为 false
  isSubmodule: boolean;
  children: RepositoryNode[];
}

export interface ScanProgress {
  // 截至当前已扫描的目录总数 (含当前目录)
  scannedDirectories: number;
  // 截至当前已发现的仓库总数
  foundRepositories: number;
  // 刚完成扫描的目录
  currentDirectory: string;
}

export interface RepositoryScanResult {
  // 已 resolve 的扫描根
  rootPath: string;
  // 顶层仓库条目; 仓中仓挂在父条目的 children 下
  repositories: RepositoryNode[];
  scannedDirectories: number;
}
