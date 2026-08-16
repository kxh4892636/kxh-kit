import { EventEmitter } from "events";

import { describe, expect, it, vi } from "vitest";

import { createSshExecutor } from "./ssh-executor.js";
import type { SpawnImpl } from "./local-executor.js";

interface FakeProcessSpec {
  stdout?: string | Buffer;
  stderr?: string;
  exitCode?: number;
  // spawn 阶段同步报错 (如 ssh 二进制缺失)
  spawnError?: Error;
  // 永不 close (配 timeoutMs 用例)
  neverClose?: boolean;
}

interface SpawnCall {
  command: string;
  args: string[];
}

// 假 child_process.spawn: 记录调用参数, 按 spec 异步吐出 stdout/stderr 后 close
const createFakeSpawn = (spec: FakeProcessSpec) => {
  const calls: SpawnCall[] = [];
  const spawnImpl = ((command: string, args: string[]) => {
    calls.push({ command, args });
    const proc = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: (signal?: string) => void;
    };
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = vi.fn(() => true);
    if (spec.spawnError) {
      queueMicrotask(() => proc.emit("error", spec.spawnError));
      return proc;
    }
    if (!spec.neverClose) {
      queueMicrotask(() => {
        if (spec.stdout !== undefined) {
          proc.stdout.emit(
            "data",
            typeof spec.stdout === "string" ? Buffer.from(spec.stdout, "utf8") : spec.stdout,
          );
        }
        if (spec.stderr !== undefined) {
          proc.stderr.emit("data", Buffer.from(spec.stderr, "utf8"));
        }
        proc.emit("close", spec.exitCode ?? 0);
      });
    }
    return proc;
  }) as unknown as SpawnImpl;
  return { spawnImpl, calls };
};

describe("ssh-executor 命令构造", () => {
  it("ControlMaster 复用参数 + destination + 远程命令", async () => {
    const { spawnImpl, calls } = createFakeSpawn({ stdout: "ok\n" });
    const executor = createSshExecutor(
      { host: "example.com", user: "git" },
      { spawnImpl, controlPathDir: "mux-test-dir" },
    );

    const result = await executor.exec("git", ["status", "--short"], { cwd: "/srv/repos" });

    expect(result).toEqual({ stdout: "ok\n", stderr: "", exitCode: 0 });
    expect(calls).toHaveLength(1);
    const { command, args } = calls[0];
    expect(command).toBe("ssh");
    const joined = args.join(" ");
    expect(joined).toContain("-o ControlMaster=auto");
    // ControlPath 落入选配目录, %C 由 ssh 展开为连接参数 hash (Windows 上分隔符为 \);
    // 短文件名是给 Windows AF_UNIX 路径长度限制留余量
    expect(joined).toMatch(/-o ControlPath=mux-test-dir[\\/]dv-%C/);
    expect(joined).toContain("-o ControlPersist=600");
    // 应用场景必须快速失败而不是挂起等待密码/确认交互
    expect(joined).toContain("-o BatchMode=yes");
    // 用户 ssh config 里可能配置端口转发, 纯执行会话不需要
    expect(joined).toContain("-o ClearAllForwardings=yes");
    expect(joined).toContain("-o ConnectTimeout=10");
    expect(args[args.length - 2]).toBe("git@example.com");
    expect(args[args.length - 1]).toBe("cd '/srv/repos' && git 'status' '--short'");
  });

  // 真实主机 smoke 实测: Windows OpenSSH 的 ControlMaster 在无控制台后台 spawn 下
  // master 立即 reset (exit 255 "Failed to connect to new control master"), 必须默认关闭
  it("win32 默认不启用 mux (逐命令建连), POSIX 默认启用", async () => {
    const winSpawn = createFakeSpawn({});
    const winExecutor = createSshExecutor(
      { host: "example.com" },
      { spawnImpl: winSpawn.spawnImpl, platform: "win32" },
    );
    await winExecutor.exec("git", ["status"], { cwd: "/srv" });
    const winArgs = winSpawn.calls[0].args.join(" ");
    expect(winArgs).not.toContain("ControlMaster");
    expect(winArgs).not.toContain("ControlPath");
    expect(winArgs).not.toContain("ControlPersist");
    expect(winArgs).toContain("-o BatchMode=yes");

    const posixSpawn = createFakeSpawn({});
    const posixExecutor = createSshExecutor(
      { host: "example.com" },
      { spawnImpl: posixSpawn.spawnImpl, platform: "linux" },
    );
    await posixExecutor.exec("git", ["status"], { cwd: "/srv" });
    expect(posixSpawn.calls[0].args.join(" ")).toContain("-o ControlMaster=auto");
  });

  it("显式 controlPathDir 在 win32 上视为强制开启 mux (逃生舱)", async () => {
    const { spawnImpl, calls } = createFakeSpawn({});
    const executor = createSshExecutor(
      { host: "example.com" },
      { spawnImpl, platform: "win32", controlPathDir: "mux-test-dir" },
    );
    await executor.exec("git", ["status"], { cwd: "/srv" });
    expect(calls[0].args.join(" ")).toContain("-o ControlMaster=auto");
  });

  it("port 经 -p 传参; 无 cwd 时不生成 cd 前缀", async () => {
    const { spawnImpl, calls } = createFakeSpawn({});
    const executor = createSshExecutor({ host: "example.com", port: 2222 }, { spawnImpl });

    await executor.exec("git", ["rev-parse", "HEAD"]);

    const { args } = calls[0];
    expect(args.join(" ")).toContain("-p 2222");
    expect(args[args.length - 2]).toBe("example.com");
    expect(args[args.length - 1]).toBe("git 'rev-parse' 'HEAD'");
  });

  it("路径与 rev 参数单引号包裹防注入 (单引号自身转义)", async () => {
    const { spawnImpl, calls } = createFakeSpawn({});
    const executor = createSshExecutor({ host: "h" }, { spawnImpl });

    await executor.exec("git", ["log", "--format=%H", "feat'; rm -rf /; echo '"], {
      cwd: "/opt/it's here",
    });

    const remoteCommand = calls[0].args[calls[0].args.length - 1];
    expect(remoteCommand).toBe(
      "cd '/opt/it'\\''s here' && git 'log' '--format=%H' 'feat'\\''; rm -rf /; echo '\\'''",
    );
  });

  it("拒绝非法命令名 (命令只允许白名单字符)", async () => {
    const { spawnImpl, calls } = createFakeSpawn({});
    const executor = createSshExecutor({ host: "h" }, { spawnImpl });

    await expect(executor.exec("git; rm -rf /", [])).rejects.toThrow();
    await expect(executor.exec("/usr/bin/git", [])).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("ssh 自身错误 (认证/不可达) 以 exitCode 255 + stderr resolve, 由调用方判读", async () => {
    const { spawnImpl } = createFakeSpawn({
      stderr: "ssh: connect to host example.com port 22: Connection timed out\r\n",
      exitCode: 255,
    });
    const executor = createSshExecutor({ host: "example.com" }, { spawnImpl });

    const result = await executor.exec("git", ["status"]);
    expect(result.exitCode).toBe(255);
    expect(result.stderr).toContain("Connection timed out");
  });

  it("spawn 失败 (本机无 ssh CLI) reject", async () => {
    const { spawnImpl } = createFakeSpawn({ spawnError: new Error("spawn ssh ENOENT") });
    const executor = createSshExecutor({ host: "h" }, { spawnImpl });

    await expect(executor.exec("git", ["status"])).rejects.toThrow("spawn ssh ENOENT");
  });

  it("超时杀死进程并 reject", async () => {
    const { spawnImpl } = createFakeSpawn({ neverClose: true });
    const executor = createSshExecutor({ host: "h" }, { spawnImpl });

    await expect(executor.exec("git", ["status"], { timeoutMs: 50 })).rejects.toThrow(/timed out/i);
  });

  it("execBuffer 透传二进制 stdout (blob 场景)", async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const { spawnImpl, calls } = createFakeSpawn({ stdout: bytes });
    const executor = createSshExecutor({ host: "h" }, { spawnImpl });

    const result = await executor.execBuffer("git", ["cat-file", "blob", "abc123"], {
      cwd: "/srv/r",
    });
    expect(result.stdout).toEqual(bytes);
    const remoteCommand = calls[0].args[calls[0].args.length - 1];
    expect(remoteCommand).toBe("cd '/srv/r' && git 'cat-file' 'blob' 'abc123'");
  });
});
