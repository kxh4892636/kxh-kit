# 播放器界面样张

Hallmark 流程产出的单屏样张，用来定住视觉方向；正式实现见 [04-随机播放站点实现](../../plans/implementing/2026-10-28-古典音乐曲库与随机播放站点/04-随机播放站点实现.md)，风格决策见 [05-界面视觉方向](../../plans/implementing/2026-10-28-古典音乐曲库与随机播放站点/05-界面视觉方向.md)。

## 本地预览

样张要有音频才完整，音频不进仓（约 170 MB）。在仓库根执行：

```powershell
# 1) 把 4 段样张音频放进 ui-comp/media（文件名与 library.json 一致）
$src = 'C:\Users\kxh\Music\musopen-flac'
Copy-Item "$src\Bach_GoldbergVariations\JohannSebastianBach-05-GoldbergVariationsBwv.988-Variation4.flac" docs/music/design/ui-comp/media/bach-var4.flac
Copy-Item "$src\Greig_PeerGynt\EdvardGrieg-PeerGyntSuiteNo.1Op.46-01-Morning.flac" docs/music/design/ui-comp/media/grieg-morning.flac
Copy-Item "$src\Mozart_MagicFluteOverture\WolfgangAmadeusMozart-MagicFluteOverture.flac" docs/music/design/ui-comp/media/mozart-flute.flac
Copy-Item "$src\Suk_Meditation\JosefSuk-Meditation.flac" docs/music/design/ui-comp/media/suk-meditation.flac

# 2) 起一个带 Range 的静态服务（file:// 下 fetch 会被拦；python -m http.server 不认 Range，波形无法定位）
python docs/music/design/ui-comp/tools/serve_range.py 5271
```

打开 <http://127.0.0.1:5271/>。`tools/serve_range.py` 返回 `206` 与 `Content-Range`，与正式站点由 Hono `serve-static` 提供的能力一致。没有音频文件时页面照常渲染，点「播放」会静默失败——这是样张的已知限制。

## 组成

| 文件                      | 作用                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `index.html`              | 单屏结构：顶栏（字标 + 传输 + 键位提示）、正在播放、波形、试听样张、最近听过、页脚  |
| `styles.css`              | 页面样式；第 1-3 行是 Hallmark 印记与自查结论                                       |
| `tokens.css` / `base.css` | Bloom 主题令牌与基础规则（`theme.mjs scaffold` 产出）                               |
| `app.js`                  | 洗牌袋、`localStorage` 历史（13 条、去重）、进度、键盘（空格 / n）                  |
| `library.json`            | 4 首真实曲目元数据（作曲家、作品、乐章、时长、波形、音频路径）                      |
| `media/*-wave.png`        | 波形剪影（由 Internet Archive 封面 PNG 的 alpha 反相得到，`mask-image` 着色为墨色） |
| `fonts/*.woff2`           | Ranade 400/500/700（Fontshare），自托管避免依赖 CDN                                 |

## 与正式实现的差别

- 正式站点由 Hono 提供 `GET /api/tracks` 与 `/media/*`（Range/206），样张用静态 `library.json` 与静态文件。
- 样张是原生 DOM 与模板字符串；正式实现改为 React 组件 + `zustand` store，视觉令牌与规则照搬。
- 样张的 4 首是试听的样张；正式曲线是 145 首。
