# music

本地古典曲库的随机播放器。前端 React 静态站点，后端 Hono 只做三件事：发索引、发音频（HTTP Range/206）、发构建产物。历史与洗牌袋都在浏览器里。

## 结构

```
client/app/            页面、组件、store、播放钩子
  components/ui/       shadcn/ui 组件（Button）
  store/               洗牌袋与历史的纯函数 + zustand store
  playback/            单个 <audio> 元素的所有权
server/                Hono 应用、配置、索引加载
server/data/           tracks.json 与 145 张波形剪影
shared/                前后端共用的类型与 zod schema
scripts/build-library.py  从本地曲库重建索引与波形
e2e/                   Playwright 冒烟
```

## 开发

```powershell
pnpm install
cp .env.example .env        # 按需改 MUSIC_ROOT
pnpm --filter @kxh4892636/music dev      # 前 5273、后端 5210
```

`dev` 起两个进程：`node --watch --experimental-strip-types server/main.ts` 与 `vp dev`；Vite 把 `/api`、`/media`、`/waves` 代理到 5210。

音频由 `server/media.ts` 按 512 KB 分片返回（开放式 `Range: bytes=N-` 也只回一片，带 `audio/flac` 与 `ETag`）；预加载交给浏览器自己的 read-ahead，前端不额外预取。

## 构建与运行

```powershell
pnpm --filter @kxh4892636/music build    # tsc ×2 + vp build → dist/
pnpm --filter @kxh4892636/music start    # node dist/server/main.js，监听 127.0.0.1:5210
```

`.env` 的键：`PORT`、`MUSIC_ROOT`（曲库根，仓库外）、`TRACKS_FILE`、`WAVES_ROOT`、`CLIENT_DIR`。服务端在启动时读一次索引并按 zod 校验，改索引后重启即可，不用重建前端。

## 数据

`server/data/tracks.json` 与 `server/data/waves/*.png` 由脚本生成：

```powershell
python -m pip install pillow
$env:MUSIC_ROOT = "C:\Users\kxh\Music\musopen-flac"
pnpm --filter @kxh4892636/music data
```

波形剪影来自 Internet Archive 的封面 PNG：那张图是黑底 + 挖空的波形，脚本把 alpha 反相成白色剪影，前端用 `mask-image` 以墨色着色。

## 部署

生产在 `ali`（`123.57.92.26`）上跑 `/music/`：应用在 `/srv/music-app`，曲库在 `/srv/music-library`，systemd 单元 `music.service` 监听 `127.0.0.1:5210`，nginx 只反代 `/music/`。构建要带前缀：

```powershell
$env:MUSIC_BASE = "/music/"
pnpm --filter @kxh4892636/music build
```

服务器侧的 `BASE_PATH=/music` 让 Hono 把页面、API、音频一起挂在 `/music` 下。步骤与安全措施见 [06-部署到服务器](../../docs/music/plans/implementing/2026-10-28-古典音乐曲库与随机播放站点/06-部署到服务器.md)。

## 测试

```powershell
pnpm --filter @kxh4892636/music test        # vitest：洗牌袋、历史、格式化、索引加载、路由
pnpm --filter @kxh4892636/music test:e2e    # 先 build，再用真实服务跑 Playwright
```

## 许可

录音来自 [Internet Archive · Musopen](https://archive.org/details/MusopenCollectionAsFlac)，CC Public Domain Mark 1.0。
