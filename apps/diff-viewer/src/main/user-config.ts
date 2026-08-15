import { promises as fs } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";

export interface UserConfig {
  version: 1;
  client: Record<string, unknown>;
}

const CONFIG_VERSION = 1 as const;

// UI 偏好的体积上限给得宽裕; 超过基本意味着 bug 或滥用
export const MAX_USER_CONFIG_BYTES = 64 * 1024;

export const getUserConfigPath = (): string => {
  const configDir = process.env.DIFIT_CONFIG_DIR?.trim();
  if (configDir) {
    return join(configDir, "config.json");
  }
  return join(homedir(), ".difit", "config.json");
};

const createDefaultUserConfig = (): UserConfig => ({ version: CONFIG_VERSION, client: {} });

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseUserSettingsPatch = (body: unknown): Record<string, unknown> | null => {
  if (!isPlainObject(body) || !isPlainObject(body.client)) {
    return null;
  }
  if (Buffer.byteLength(JSON.stringify(body.client), "utf-8") > MAX_USER_CONFIG_BYTES) {
    return null;
  }
  return body.client;
};

export const readUserConfig = async (path: string = getUserConfigPath()): Promise<UserConfig> => {
  try {
    const raw = await fs.readFile(path, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (isPlainObject(parsed) && isPlainObject(parsed.client)) {
      return { version: CONFIG_VERSION, client: parsed.client };
    }
  } catch {
    // 配置缺失或不可读时回退默认值
  }
  return createDefaultUserConfig();
};

// 浅合并 patch 到已存 client 设置。多个实例可能写同一文件; 设置变更足够稀少,
// 按顶层 key last-write-wins 可以接受
export const updateUserClientSettings = async (
  patch: Record<string, unknown>,
  path: string = getUserConfigPath(),
): Promise<UserConfig> => {
  const current = await readUserConfig(path);
  const next: UserConfig = {
    version: CONFIG_VERSION,
    client: { ...current.client, ...patch },
  };

  const serialized = `${JSON.stringify(next, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf-8") > MAX_USER_CONFIG_BYTES) {
    throw new Error("User settings exceed the maximum allowed size");
  }

  await fs.mkdir(dirname(path), { recursive: true });
  // 临时文件 + rename, 避免中途崩溃留下损坏的配置
  const tmpPath = `${path}.${process.pid}.tmp`;
  await fs.writeFile(tmpPath, serialized, "utf-8");
  await fs.rename(tmpPath, path);
  return next;
};
