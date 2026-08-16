import { describe, expect, it } from "vitest";

import {
  buildRemoteRepoKey,
  buildVscodeRemoteUrl,
  formatSshDestination,
  isRemoteRepoKey,
  parseRemoteRepoKey,
  parseSshTarget,
  shellQuote,
  validateRemotePath,
} from "./ssh-target.js";

describe("parseSshTarget", () => {
  it("解析 ssh config Host 别名 (无 user/port)", () => {
    expect(parseSshTarget("my-server")).toEqual({ host: "my-server" });
  });

  it("解析 user@host", () => {
    expect(parseSshTarget("root@123.57.92.26")).toEqual({ host: "123.57.92.26", user: "root" });
  });

  it("解析 user@host:port 与 host:port", () => {
    expect(parseSshTarget("deploy@example.com:2222")).toEqual({
      host: "example.com",
      user: "deploy",
      port: 2222,
    });
    expect(parseSshTarget("example.com:8022")).toEqual({ host: "example.com", port: 8022 });
  });

  it("输入前后空白容忍, host 保留点/连字符/下划线", () => {
    expect(parseSshTarget("  git@git_hub.internal  ")).toEqual({
      host: "git_hub.internal",
      user: "git",
    });
  });

  it.each([
    "",
    "   ",
    "user@",
    "@host",
    "user@host:0",
    "user@host:65536",
    "user@host:abc",
    "user@host:22:33",
    "user@@host",
    "ho st",
    "user name@host",
    "host;rm -rf /",
    "host$(whoami)",
    "host`id`",
    "host|cat",
    "-oProxyCommand=evil",
  ])("拒绝非法/注入形态: %j", (input) => {
    expect(() => parseSshTarget(input)).toThrow();
  });
});

describe("formatSshDestination", () => {
  it("不含 port (port 经 ssh -p 单独传参)", () => {
    expect(formatSshDestination({ host: "example.com", user: "git", port: 2222 })).toBe(
      "git@example.com",
    );
    expect(formatSshDestination({ host: "my-alias" })).toBe("my-alias");
  });
});

describe("validateRemotePath", () => {
  it("接受绝对 POSIX 路径并去掉尾部斜杠", () => {
    expect(validateRemotePath("/home/user/repos")).toBe("/home/user/repos");
    expect(validateRemotePath("/home/user/repos/")).toBe("/home/user/repos");
    expect(validateRemotePath("/")).toBe("/");
  });

  it.each(["relative/path", "~/repos", "", "  ", "/tmp/evil\nrm -rf", "/tmp/evi\rl", "C:\\repos"])(
    "拒绝非绝对 POSIX 或含控制字符: %j",
    (input) => {
      expect(() => validateRemotePath(input)).toThrow();
    },
  );
});

describe("shellQuote", () => {
  it("单引号包裹, 内部单引号以 '\\'' 转义", () => {
    expect(shellQuote("/plain/path")).toBe("'/plain/path'");
    expect(shellQuote("it's")).toBe("'it'\\''s'");
    expect(shellQuote("a b;c`d`$(e)")).toBe("'a b;c`d`$(e)'");
  });
});

describe("远程仓库键 (评论存储键 = ssh://user@host/path)", () => {
  it("build/parse 往返一致, 含 port 与 user", () => {
    const key = buildRemoteRepoKey({ host: "example.com", user: "git", port: 2222 }, "/srv/repos");
    expect(key).toBe("ssh://git@example.com:2222/srv/repos");
    expect(isRemoteRepoKey(key)).toBe(true);
    expect(parseRemoteRepoKey(key)).toEqual({
      target: { host: "example.com", user: "git", port: 2222 },
      remotePath: "/srv/repos",
    });
  });

  it("无 user 的 Host 别名形态", () => {
    const key = buildRemoteRepoKey({ host: "my-server" }, "/opt/app");
    expect(key).toBe("ssh://my-server/opt/app");
    expect(parseRemoteRepoKey(key)).toEqual({
      target: { host: "my-server" },
      remotePath: "/opt/app",
    });
  });

  it("非 ssh:// 键识别与非法键拒绝", () => {
    expect(isRemoteRepoKey("D:\\work\\repo")).toBe(false);
    expect(isRemoteRepoKey("/home/user/repo")).toBe(false);
    expect(() => parseRemoteRepoKey("ssh://")).toThrow();
    expect(() => parseRemoteRepoKey("ssh://host")).toThrow();
    expect(() => parseRemoteRepoKey("ssh://ho st/x")).toThrow();
  });
});

describe("buildVscodeRemoteUrl", () => {
  it("生成 vscode-remote 协议 URL, 携带行号", () => {
    expect(buildVscodeRemoteUrl({ host: "my-server" }, "/srv/repos/app/a.ts", 12)).toBe(
      "vscode://vscode-remote/ssh-remote+my-server/srv/repos/app/a.ts:12",
    );
  });

  it("user 与 port 编入 destination 段; 文件路径特殊字符编码", () => {
    expect(
      buildVscodeRemoteUrl({ host: "example.com", user: "git", port: 2222 }, "/srv/a b.ts"),
    ).toBe("vscode://vscode-remote/ssh-remote+git@example.com:2222/srv/a%20b.ts");
  });
});
