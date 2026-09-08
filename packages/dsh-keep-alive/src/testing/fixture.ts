import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { pathsFor, preparePaths, saveJson, type Paths } from "../paths.js";
import type { Version } from "../runtime/versions.js";
export const temporary = async (): Promise<string> =>
  mkdtemp(join(tmpdir(), "dsh-keep-alive-test-"));
export const freePort = async (): Promise<number> => {
  const server = createServer();
  await new Promise<void>((resolve: (value: void | PromiseLike<void>) => void): unknown =>
    server.listen(0, "127.0.0.1", resolve),
  );
  const port = (
    server.address() as {
      port: number;
    }
  ).port;
  await new Promise<void>(
    (
      resolve: (value: void | PromiseLike<void>) => void,
      reject: (reason?: unknown) => void,
    ): unknown =>
      server.close((error: Error | undefined): void => (error ? reject(error) : resolve())),
  );
  return port;
};
export const fixtureVersion = async (
  paths: Paths,
  version: string = "1.0.0",
  body?: string,
): Promise<Version> => {
  const directory = join(paths.versions, version, "node_modules", "@deepseek-ai", "dsh");
  await mkdir(join(directory, "lib"), { recursive: true });
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({ version, type: "module", bin: { dsh: "lib/bin.js" } }),
  );
  const entry = join(directory, "lib", "bin.js");
  await writeFile(
    entry,
    body ??
      `import { createServer } from 'node:http';
const port=Number(process.argv[process.argv.indexOf('--port')+1]);
process.stdout.write('fixture-start\\n');
process.stderr.write('fixture-stderr\\n');
createServer((req,res)=>{
 if(req.url==='/crash'){res.end('bye');setTimeout(()=>process.exit(7),10);return;}
 res.end(JSON.stringify({pid:process.pid,cwd:process.cwd(),marker:process.env.MARKER}));
}).listen(port,'127.0.0.1');
`,
  );
  return { version, entry };
};
export const fixture = async (): Promise<{
  local: string;
  paths: Paths;
  port: number;
  version: Version;
}> => {
  const local = await temporary();
  const port = await freePort();
  const paths = pathsFor(port, join(local, "dsh-keep-alive"));
  await preparePaths(paths);
  const version = await fixtureVersion(paths);
  await saveJson(paths.state, { version: version.version });
  return { local, paths, port, version };
};
