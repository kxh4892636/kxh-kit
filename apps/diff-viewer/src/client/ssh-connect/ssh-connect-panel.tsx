// SSH 远程连接面板 (issue 06): 折叠式表单, 输入 ssh config Host 别名或
// user@host[:port] + 远程绝对路径, 提交经 scan.openRemote 走 bridge.connectSsh;
// 展开时加载历史连接 (userData 落盘), 点击条目回填并直连。
// 纯展示+表单组件, 连接状态机全部在 useRepositoryScan。
import { ChevronDown, ChevronRight, Loader2, Terminal } from "lucide-react";
import { useEffect, useState } from "react";

import type { SshConnectionEntry } from "../../types/ssh";

import type { RepositoryScanState } from "../repo-tree/use-repository-scan";

interface SshConnectPanelProps {
  scan: RepositoryScanState;
}

export const SshConnectPanel: React.FC<SshConnectPanelProps> = (props) => {
  const { scan } = props;
  const [expanded, setExpanded] = useState(false);
  const [target, setTarget] = useState("");
  const [path, setPath] = useState("");
  const [history, setHistory] = useState<SshConnectionEntry[]>([]);
  // 仅当错误来自本面板的连接尝试时展示 (scan.error 也承载本地扫描/激活错误)
  const [attemptFailed, setAttemptFailed] = useState(false);

  const bridge = typeof window === "undefined" ? undefined : window.diffViewerBridge;

  // 展开时加载历史连接; 历史读取失败不阻断表单使用
  useEffect(() => {
    if (!expanded || !bridge) {
      return;
    }
    let cancelled = false;
    bridge
      .listSshConnections()
      .then((entries) => {
        if (!cancelled) {
          setHistory(entries);
        }
      })
      .catch((historyError: unknown) => {
        console.error("Failed to load ssh connection history:", historyError);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, bridge]);

  if (!bridge) {
    return null;
  }

  const submit = (nextTarget: string, nextPath: string): void => {
    const trimmedTarget = nextTarget.trim();
    const trimmedPath = nextPath.trim();
    // 不以 scan.scanning 为守卫: 在途的本地扫描可被连接顶掉 (openRemote 序列号失效),
    // 否则启动扫描未完成时点击历史条目会静默无效
    if (trimmedTarget === "" || trimmedPath === "") {
      return;
    }
    setAttemptFailed(false);
    void scan.openRemote(trimmedTarget, trimmedPath).then((succeeded) => {
      if (succeeded) {
        setExpanded(false);
      } else {
        setAttemptFailed(true);
      }
    });
  };

  const handleHistoryClick = (entry: SshConnectionEntry): void => {
    setTarget(entry.target);
    setPath(entry.path);
    submit(entry.target, entry.path);
  };

  return (
    <section
      data-testid="ssh-connect-panel"
      className="border-b border-github-border flex flex-col"
    >
      <button
        type="button"
        data-testid="ssh-connect-toggle"
        onClick={() => setExpanded((previous) => !previous)}
        className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-github-text-muted hover:text-github-text-primary transition-colors"
        title="Connect to a remote host over SSH"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Terminal size={12} />
        SSH Remote
      </button>
      {expanded && (
        <div className="flex flex-col gap-1.5 px-3 pb-2">
          <input
            data-testid="ssh-target-input"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            placeholder="host alias or user@host[:port]"
            className="px-2 py-1 text-xs rounded border border-github-border bg-github-bg-primary text-github-text-primary"
          />
          <input
            data-testid="ssh-path-input"
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="/absolute/remote/path"
            className="px-2 py-1 text-xs rounded border border-github-border bg-github-bg-primary text-github-text-primary"
          />
          <button
            type="button"
            data-testid="ssh-connect-submit"
            disabled={scan.scanning}
            onClick={() => submit(target, path)}
            className="flex items-center justify-center gap-1 px-2 py-1 text-xs rounded text-github-text-secondary hover:text-github-text-primary hover:bg-github-bg-tertiary transition-colors disabled:opacity-50"
          >
            {scan.scanning && <Loader2 size={12} className="animate-spin" />}
            Connect
          </button>
          {attemptFailed && scan.error !== null && (
            <div data-testid="ssh-connect-error" className="text-xs text-github-danger">
              {scan.error}
            </div>
          )}
          {history.length > 0 && (
            <ul data-testid="ssh-history-list" className="flex flex-col">
              {history.map((entry, index) => (
                <li key={`${entry.target}:${entry.path}`}>
                  <button
                    type="button"
                    data-testid={`ssh-history-entry-${index}`}
                    onClick={() => handleHistoryClick(entry)}
                    className="w-full text-left px-2 py-1 text-xs rounded text-github-text-secondary hover:text-github-text-primary hover:bg-github-bg-tertiary transition-colors truncate"
                    title={`${entry.target} ${entry.path}`}
                  >
                    {entry.target} {entry.path}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};
