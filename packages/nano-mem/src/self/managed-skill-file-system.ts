import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
  type Dirent,
} from "node:fs";
import { join, relative } from "node:path";

export interface ManagedSkillFileSystem {
  copyFile: (source: string, target: string) => void;
  exists: (path: string) => boolean;
  kind: (path: string) => "directory" | "file" | "symlink";
  listFiles: (root: string) => readonly string[];
  makeDirectory: (path: string) => void;
  readFile: (path: string) => Buffer;
  realpath: (path: string) => string;
  remove: (path: string) => void;
  rename: (source: string, target: string) => void;
  writeFile: (path: string, content: string) => void;
}

const fileKind = (path: string): "directory" | "file" | "symlink" => {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return "symlink";
  return stat.isDirectory() ? "directory" : "file";
};

export const nodeManagedSkillFileSystem: ManagedSkillFileSystem = {
  copyFile: copyFileSync,
  exists: existsSync,
  kind: fileKind,
  listFiles: (root: string): readonly string[] =>
    readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry: Dirent): boolean => entry.isFile() || entry.isSymbolicLink())
      .map((entry: Dirent): string =>
        relative(root, join(entry.parentPath, entry.name)).replaceAll("\\", "/"),
      )
      .sort((left: string, right: string): number => left.localeCompare(right)),
  makeDirectory: (path: string): void => {
    mkdirSync(path, { recursive: true });
  },
  readFile: readFileSync,
  realpath: realpathSync,
  remove: (path: string): void => rmSync(path, { force: true, recursive: true }),
  rename: renameSync,
  writeFile: (path: string, content: string): void => writeFileSync(path, content),
};
