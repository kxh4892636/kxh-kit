---
name: codin-d2c-cli
description: |
  Converts Figma designs to production UI code (Web/iOS/Android/Lynx) via the codin-d2c CLI,
  and drives a runtime Design Review (设计走查) of the running app against the original Figma design.
  Use when the user provides a Figma URL and asks to implement it as code,
  asks to "convert design to code", "implement this Figma", "generate UI from design",
  or asks to "design review / 设计走查 / 视觉走查" a running page against its Figma source.
  Guides the correct workflow for the get-figma-data, download-icons, query-ui-rules,
  verify-code, design-review, design-review-fix, paste-screenshot, and cleanup-temp commands.
version: 4.0.1
tags: [figma, design-to-code, d2c, ui, cli, design-review]
tools: [codin-d2c]
env:
  required:
    - CODIN_D2C_TOKEN
    - FIGMA_ACCESS_TOKEN
---

# Codin D2C CLI — Figma Design to Code

Converts Figma designs into production UI code for Web, iOS, Android, and Lynx platforms
via a CLI tool optimized for AI agent consumption.

## Installation

The CLI is provided by the `@byted/codin-d2c-mcp` npm package:

```bash
# Install globally (recommended for repeated use)
npm install -g @byted/codin-d2c-mcp --registry=https://bnpm.byted.org

# Or run directly via npx (no install needed)
npx -y --registry=https://bnpm.byted.org --package @byted/codin-d2c-mcp@latest codin-d2c <command> [options]
```

After global install, the `codin-d2c` command is available directly.
With npx, prefix all commands with `npx -y --registry=https://bnpm.byted.org --package @byted/codin-d2c-mcp@latest`.

**Version policy:**

- Treat this Skill file's frontmatter `version` as the **minimum required CLI version**.
- **Do NOT hardcode a package version** in runtime commands; prefer `@latest` for stable self-refreshing installs.
- Before running the workflow, compare the currently available CLI version with this Skill's `version`.
- If the installed CLI is missing or older than this Skill's version, either:
  - run commands through `npx -y --registry=https://bnpm.byted.org --package @byted/codin-d2c-mcp@latest`, or
  - upgrade the global install first, then continue.

## Prerequisites — Token Configuration

Two tokens are required. Set them as environment variables before running a command:

```bash
export CODIN_D2C_TOKEN=<your-d2c-token>         # Get at https://design-space.bytedance.net/d2c
export FIGMA_ACCESS_TOKEN=<your-figma-token>     # Get at https://www.figma.com/settings
```

Tokens can also be passed per-command via `--d2c-token` and `--figma-token` flags.

**Token resolution is `flag → env → cache → error`** (per token): a `--d2c-token`/`--figma-token` flag wins, else the env var, else the user-level cache, else a `TOKEN_MISSING` error naming exactly which token is absent. The first time a token arrives via flag/env it is **write-through cached** to `~/.codin-d2c/credentials.json` (plaintext `0600`), so once exported it persists for future bare runs in new terminals — no need to re-export every shell. Token values are only ever shown masked, never printed in plaintext.

- Verify token configuration (also write-throughs the cache): `codin-d2c auth verify`
- Inspect, per token, the resolution source + masked value + cache path (read-only, writes nothing): `codin-d2c auth status`
- Clear the user-level cache (rotating / leaving a machine / recovering a wrongly cached token): `codin-d2c auth clear-cache [--token codin|figma|all]` (default `all`). This explicit removal always runs even when caching is disabled via `CODIN_D2C_TOKEN_CACHE=0`.

## Output Protocol

Commands output **JSON to stdout by default**. Logs go to stderr. The only explicit non-JSON stdout mode is `codin-d2c query-ui-rules --format markdown`, which writes `componentsMenu` / `rulesMarkdown` / `topicMarkdown` as plain Markdown for human debugging or direct rule reading. JSON structure:

```
{
  "ok": true|false,
  "command": "codin-d2c <name>",
  "schemaVersion": 1,
  "result": { ... },           // on success
  "error": { "code", "message", "exit_code" },  // on failure
  "fix": "recovery instruction",                 // on failure
  "next_actions": [            // HATEOAS — always present
    { "command": "...", "description": "...", "params": { ... } }
  ]
}
```

**IMPORTANT:** After each command, read `next_actions` to determine what to do next.
The `params` field in each next_action may contain pre-filled `value` fields from the
current response — use them directly.

## Long-Running Command Budget

`get-figma-data`, `verify-code`, and `design-review` can each take 2-9 minutes.
When invoking them from any host agent or shell/tool runner, set or request a
10-minute timeout/wait budget if supported, and wait for the command to finish
instead of interrupting early unless it exits, returns a structured error, or the
user cancels.

## Recipe: Complete D2C Workflow

Follow these steps in order. Each step's `next_actions` guides the next.

### Step -1 — Verify CLI Version Compatibility (MANDATORY)

Before Step 0, the agent MUST verify that the CLI version is **greater than or equal to**
this Skill file's frontmatter `version`.

Required procedure:

1. Read this Skill file's frontmatter and extract the current Skill `version`.
2. Detect whether `codin-d2c` is already available locally.
3. If available, run:

```bash
codin-d2c commands
```

4. Parse `result.version` from the JSON response.
5. Compare semantic versions numerically (`major.minor.patch`).
6. If `codin-d2c` is missing, or `result.version` is lower than this Skill's `version`,
   switch to the fresh path immediately:

```bash
npx -y --registry=https://bnpm.byted.org --package @byted/codin-d2c-mcp@latest codin-d2c commands
```

7. If the `npx @latest` path returns a compatible version, use the same `npx -y --registry=https://bnpm.byted.org --package @byted/codin-d2c-mcp@latest`
   prefix for all subsequent commands in this session.
8. If the local global install is already compatible, direct `codin-d2c` commands may be used.
9. If the `npx @latest` path is still lower than this Skill's `version`, stop and report that the npm registry has not published a compatible package yet.

**Never assume the local CLI is new enough without checking `result.version` first.**

**Do not pin runtime commands to a fixed package version.** The compatibility threshold comes from
this Skill's frontmatter `version`, while the refresh path should continue using `@latest`.

### Step 0 — Detect Platform (CRITICAL for quality)

**Before calling any command**, inspect the target project to determine the correct platform.
Wrong platform produces significantly worse results — worse than using `universal`.

Detection checklist:

**CRITICAL RULE FOR WEB PROJECTS:**
If the project appears to be a Web project AND is NOT Lynx, iOS, or Android, you **MUST FIRST** evaluate it against the `web-h5` Scoring Algorithm below.
You are **FORBIDDEN** from choosing `web` until you have explicitly calculated the score and confirmed it does NOT meet the `web-h5` criteria.
However, if `package.json` contains `@piajs/kit` or `@piajs/hooks`, or the project root contains `pia.config.js` / `pia.config.ts`, you **MUST immediately classify it as `web-h5`** and skip the scoring step.

- **ios**: `.xcodeproj`/`.xcworkspace` exists; `.swift`/`.m` files; UIKit/SwiftUI imports
- **android**: `build.gradle`/`build.gradle.kts` exists; `.kt`/`.java` files; Android SDK imports
- **lynx**: `package.json` has `@byted-lynx/*` or `@lynx-js/*` deps; ReactLynx-specific syntax such as `<view>`/`<text>`, mixed Lynx component casing, or `.lynx.tsx` files
- **web-h5** (Mobile H5): Must meet Web criteria AND score ≥ 2 in the Web Sub-platform Scoring Algorithm below
- **web**: `package.json` has React/Vue/Angular/Svelte deps; `.tsx`/`.jsx`/`.vue` files. Only use this if it fails the `web-h5` scoring.
- **universal**: ONLY when platform is truly unidentifiable after inspection

#### Web Sub-platform Scoring Algorithm

When `web` is detected, first apply the hard-match rule below. Only if the hard-match rule does not trigger, apply the following scoring to distinguish `web-h5` from `web`:

**Hard-match rule — PIA projects (mandatory)**

- If `package.json` contains `@piajs/kit` or `@piajs/hooks`, classify as **`web-h5`**
- If the project root contains `pia.config.js` or `pia.config.ts`, classify as **`web-h5`**

Do not continue scoring after a hard match.

**Signal 1 — PostCSS / Build plugins (weight: +3)**

- `postcss-pxtorem` or `postcss-px-to-viewport` or `lib-flexible` / `amfe-flexible` in `postcss.config.js`, `package.json` devDependencies, `vite.config.ts` css.postcss, or `craco.config.js` → score += 3 (Mobile H5)

**Signal 2 — UI component library (weight: ±2)**

- Mobile H5 libraries: `vant`, `@vant/react`, `antd-mobile`, `antd-mobile-v5`, `nutui`, `@nutui/nutui-react`, `cube-ui`, `mint-ui`, `taro-ui`, `@antmjs/vantui` → score += 2
- PC Web libraries: `antd`, `@ant-design/react`, `@arco-design/web-react`, `@semi-design/react`, `element-plus`, `element-ui`, `@mui/material`, `@chakra-ui/react`, `@blueprintjs/core` → score -= 2

**Signal 3 — Viewport meta (weight: +2)**

- HTML entry (`index.html`, `public/index.html`, `document.ejs`) contains `<meta name="viewport" ...>` with `user-scalable=no` or `maximum-scale=1.0` → score += 2 (Mobile H5)

**Signal 4 — CSS unit system (weight: +1)**

- Global CSS (`:root` or `html`) sets `font-size` in `vw` units, or JS dynamically sets `document.documentElement.style.fontSize` → score += 1 (Mobile H5)

**Signal 5 — Directory naming (weight: ±1)**

- Directory or `src/pages/` subdirectory contains `h5`, `mobile`, `m-` → score += 1
- Directory or `src/pages/` subdirectory contains `pc`, `desktop`, `admin` → score -= 1

**Decision rule:**

- score ≥ 2 → **web-h5**
- score ≤ -1 → **web**
- otherwise → **web** (fallback, cannot distinguish)

#### Platform Flow Routing

- **web-h5**: Follow the standard workflow (Step 1 — Step 7), but note that Step 1 returns **finished code** instead of XML, Step 3 focuses on **Rewriting & Optimizing** the backend-generated code rather than writing from scratch, and Steps 4–6 (verify-code + the runtime design-review loop) are skipped — the backend already aligns design and code, so go from Step 3 straight to Step 7 cleanup.
- **web**: Follow the standard workflow (Step 1 — Step 7). AI reads XML + preview image and writes code itself; once the app is running, the optional runtime design-review loop (Steps 5–6) catches live drift.
- **lynx**: Follow the standard workflow with Step 3A Lynx rules query.
- **ios**, **android**, **universal**: Follow the standard workflow without Lynx rules.

Do **not** run `query-ui-rules` immediately after platform detection. `query-ui-rules` is a Lynx-only rules source, not a pre-DSL router. Run it in Step 3 only after reading the XML DSL, the DSL `CodeGenGuid`, the preview image, and project conventions.

For `web`, `web-h5`, `ios`, `android`, and `universal`, skip `query-ui-rules` entirely. Do not use Lynx rules as grounding or fallback for non-Lynx code generation; follow the DSL prompt/`CodeGenGuid`, preview image, and target project conventions instead.

### Step 1 — Fetch Design Data (or Generate H5 Code)

```bash
codin-d2c get-figma-data \
  --url "<FIGMA_URL>" \
  --directory "<ABSOLUTE_PROJECT_DIR>" \
  --platform <web-h5|web|ios|android|lynx|universal>
```

**Output Behavior depends on the `--platform`:**

**A. For Non-H5 platforms (web, ios, android, lynx, universal):**
On success, `result` contains:

- `xml_file`: path to saved XML DSL file
- `preview_image_file`: path to design screenshot
- `has_preview_image`: boolean
- `xml_length`: character count of XML
- `xml_mode`: output mode used

**You MUST read BOTH the XML file AND the preview image before generating code.**
The XML provides structural data (hierarchy, layout, styles, spacing, colors, fonts).
The preview image is the **visual ground truth** — it reveals component semantics,
visual hierarchy, alignment nuances, and interactive element distinctions that XML
alone cannot fully convey. Cross-reference both to resolve layout ambiguities.

**B. For `web-h5` platform:**
The backend `analyze-generate-v2` API is called to directly generate code.
On success, `result` contains:

- `log_id`: Backend trace ID
- `file_count`: Number of generated code files
- `result_file`: Path to the Markdown result file (`d2c_result_<timestamp>.md`) in `.d2c_temp/`
- `temp_dir`: Path to the `.d2c_temp/` directory
- `files_written`: Array of absolute paths to the individually saved code files (e.g., `index.tsx`, `index.module.scss`) in `.d2c_temp/`
- `version_tip`: Optional version update instructions from the backend
- `use_rule`: Optional backend rules for writing/formatting code

**You MUST read the `result_file` (Markdown) or the individual files in `files_written` instead of XML.**
The `result_file` acts as a comprehensive summary containing the Log ID, Version Tip, Use Rule, and the Generated Files with syntax highlighting. Use this backend-generated code as the direct baseline for Step 3.

Key options:

- `--url`: Figma design URL (required).
- `--platform`: Detect from the project first. Wrong platform = bad code.
- `--prompt`: Generation instruction / context hint (optional, primarily for `web-h5`).
- `--xml-mode <mode>`: `prompt_and_xml` (default, includes generation guidance prompt + XML), `raw_xml_only` (pure XML for machine parsing), or `raw_html_only` (backend `xml_response_mode=4`, returns raw HTML-Like data).
- `--xml-response-mode <2|3|4>`: direct backend response mode. `4` is equivalent to `--xml-mode raw_html_only`; do not pass conflicting `--xml-mode` and `--xml-response-mode` values.
- `raw_html_only` does not refresh the local XML icon cache. Download icons only when Step 1 `next_actions` includes `download-icons`, or rerun Step 1 with the default `prompt_and_xml` / `raw_xml_only` mode before icon extraction.
- `--xml-cache`: Enable server-side XML cache lookup (faster if the same design was recently fetched).
- `--inline`: Outputs XML to stdout instead of file (small designs only).
- `--no-image`: Skip preview image download.
- `--follow`: NDJSON streaming progress output.
- `--image-format <format>`: Preferred icon format: `png` or `svg`.
- `--trace-id <id>`: Request trace ID passed as HTTP `X-Request-ID` header.

### Step 2 — Download Icons (if needed)

Only run this if `next_actions` from Step 1 includes `download-icons`,
or if the user explicitly asks to download icons from an explicit icon list.

```bash
codin-d2c download-icons \
  --figma-url "<SAME_FIGMA_URL>" \
  --directory "<ASSETS_DIR>" \
  --platform <web|ios|android|lynx> \
  --icons-file "<ABSOLUTE_ICONS_JSON>"
```

Default recommendation: after reading the XML, choose the exact icons and filenames needed by the implementation and call `download-icons` in explicit mode with `--icons-file`. Explicit mode is best for partial download and optimized filenames.

`--icons-file` must be an absolute JSON file containing an array:

```json
[
  { "url": "https://...", "name": "search_active.svg" },
  { "name": "login icon/login.png", "format": "png", "nodeId": "1:23" }
]
```

In each item, `name` is required; `url`, `format`, and `nodeId` are optional.

Modes:

- Explicit mode: a non-empty `--icons-file` skips XML cache parsing and downloads only the listed icons. `--figma-url` is optional for direct URL downloads, but required when an item needs `nodeId` lookup or format refresh.
- Automatic mode: missing or empty `--icons-file` requires `--figma-url`. The command loads XML from the local 2-hour cache created by Step 1; if the local cache is missing or expired and D2C/Figma tokens are configured, it falls back to the server XML cache and refreshes the local cache after success.

Use automatic mode when the user explicitly asks for full automatic download or Figma original icon names. You may also preserve original names in an explicit JSON item. The tool sanitizes illegal names only when needed, for example `login icon/login.png` becomes `login_icon_login.png`; legal names stay unchanged. Returned icons may include optional `source_name` and `sanitized` fields.

The command downloads icons with platform-specific format conversion:

- **Web**: Preserves original format (SVG/PNG)
- **iOS**: SVG saved directly; PNG generates `.imageset` bundle
- **Android**: SVG converted to Vector Drawable XML; PNG kept as-is
- **Lynx**: SVG returns inline `svg_code`; PNG saved directly

When automatic mode, server cache fallback, `nodeId` lookup, or format refresh is needed,
`--figma-url` must be the same URL used in Step 1. If tokens are not configured or the
server cache is unavailable, re-run `get-figma-data` with the same Figma URL before
automatic icon downloading.

Additional options:

- `--icon-format <format>`: Global preferred icon format (`png` or `svg`). It overrides per-item `format`; if the requested format differs from an existing URL source format, the command uses `nodeId + --figma-url` to fetch the requested format. Missing conditions fail that single icon instead of using the wrong-format URL.

### Step 3 — Generate UI Code (or Rewrite H5 Code)

This step is YOUR responsibility.

**A. For Non-H5 platforms (web, ios, android, lynx, universal):**
Use the XML DSL and preview image from Step 1 to write the UI code from scratch. The XML contains component hierarchy, layout properties, styles, colors, fonts, spacing, and icon references.

**Business component reuse (`component-use`) — MANDATORY when present:**
When a local component registry (`codin_d2c/component-registry.json`) exists, Step 1's returned XML is auto-enriched: nodes that match a 100% deterministic active binding carry a `component-use` attribute.

- **A node having a `component-use` attribute IS the "must-use" signal** (not its `confidence` value). Import and use that exact business component — do **not** rewrite, remap, or downgrade it. Take props from `figma-component-properties` + `component-use.props` / `propMappings`; visual inference is fallback only.
- Nodes **without** `component-use` keep their `figma-*` identity. The tool emits **no** suggestions/candidates — match those yourself against the local registry (read the registry files directly) or implement from the design.
- Check `result.component_binding` in the envelope. If `resolution` is `needs-attention` / `unresolved_count > 0` (conflict / multiple active / active-unconsumable), read the `diagnostics_file` and resolve those before shipping; do not silently guess.
- The switch is the existing `--component-reuse` / `D2C_COMPONENT_REUSE` (unset = auto). Explicit registry override: `--component-registry <path>` / `D2C_COMPONENT_REGISTRY_PATH`.

**B. For `web-h5` platform:**
The code has already been generated by the backend in Step 1. Your task is to **adapt, rewrite, and optimize** the generated code to your project context.

1. Read the Markdown result from `result.result_file`.
2. Load project rules (`D2C_RULE.md`) and strictly enforce them.
3. Identify UI framework components used in the project (e.g., `@arco-design/mobile-react`, `vant`, etc.).
4. Auto-replace generic HTML with framework components (e.g., `<div className="mask">` → `<Mask />`).
5. Write the final adapted code into the actual project source directory, NOT into `.d2c_temp/`. **CRITICAL: When moving generated files, you MUST copy them precisely (e.g., specific files or directories). NEVER use wildcard copy (`cp -r .d2c_temp/*`) which copies the result markdown, and NEVER attempt to delete the markdown file to "clean up".**
6. Ensure zero static analysis errors and that all dependencies exist.

#### Step 3A — Lynx Rules Query (MANDATORY for Lynx only)

For Lynx, query rules **after** XML DSL, preview image, DSL `CodeGenGuid`, and project conventions are available, and **before** writing the first ReactLynx code draft. The `query-ui-rules` command returns ready-to-read Markdown for the Coding LLM. It does **not** parse DSL, infer signals, choose the primary component, or make routing decisions for you.

Production Lynx flow:

1. **Analyze design inputs yourself first**:
   - Read DSL `CodeGenGuid`, component hierarchy, repeated regions, scroll/overflow, modal/bottom-sheet/input/media/icon patterns, and the preview image.
   - Inspect target project conventions and imports.
   - Decide candidate Lynx `components` as the Coding LLM. Examples: `Dialog`, `Popup`, `List`, `ScrollView`, `x-input-ng`, `svg`, `image`, `text`, `view`.
2. **Discover component names when unsure**:

```bash
codin-d2c query-ui-rules \
  --platform lynx \
  --stage discover
```

Read `result.componentsMenu = [{ name, useWhen }]`, then choose the component names that match the DSL, preview image, and user request. Do not generate Lynx code from `discover` alone.

3. **Implement query before code generation**:

```bash
codin-d2c query-ui-rules \
  --platform lynx \
  --stage implement \
  --components "Dialog,List,svg" \
  --query "controlled dialog with a virtualized list and inline svg icons"
```

If the target project is ReactLynx 2.x, pass `--react-lynx-version 2.x` or pass `--directory <project>` and let `auto` detect `@byted-lynx/react-runtime`. The returned `rulesMarkdown` contains only `<LYNX_REACT_LYNX_2X_RULES>`; do not mix in 3.x provider rules or deep-dive topics. Before writing code, search the user repository for Lynx 2.x usage guides, project rules, or existing component implementations and prefer those project-specific patterns.

Read returned `result.rulesMarkdown` literally before writing code. In the normal Lynx flow it contains `<LYNX_CRITICAL_RULES>` and `<LYNX_USAGE_DOCS>` blocks; in ReactLynx 2.x it contains `<LYNX_REACT_LYNX_2X_RULES>`. Every `MUST` / `MUST NOT` rule and violation consequence is production guidance.

Non `generation-detail-example` responses include `<LYNX_RULE_LOOKUP_GUARDRAIL>`: Lynx is not React DOM / Web React. If exact usage is not covered, call `generation-detail-example`, then search the user repository for Lynx rules/guides and existing Lynx examples before coding.

4. **Generate ReactLynx code**:
   - Do not generate Web DOM code for Lynx: no `<div>`, `<span>`, browser-only CSS, or React DOM imports.
   - Follow project conventions first, then `rulesMarkdown` / optional `topicMarkdown`, then DSL prompt/`CodeGenGuid`.
5. **Optional deep-dive query only when needed**:

```bash
codin-d2c query-ui-rules \
  --platform lynx \
  --stage generation-detail-example \
  --components "Dialog,List,svg" \
  --query-keys "controlledVisibility,virtualList,inlineSvg"
```

Only call this when `rulesMarkdown` is not enough for a full prop spec or special scenario. `--query-keys` must be copied exactly from `result.deepDive.availableTopics[].queryKey`; do not invent keys. Read returned `result.topicMarkdown` as supplemental material and keep the `implement` response as the baseline.

Never pass deprecated inputs. `--dsl-snippet`, `--signals`, `--rule-types`, `--stage routing`, `--stage implementing`, `--stage verifying`, and the deprecated query label named `verify` are invalid and may be rejected. The valid stages are exactly `discover`, `implement`, and `generation-detail-example`.

Response handling:

- `discover` returns `componentsMenu`.
- `implement` returns `rulesMarkdown`.
- `generation-detail-example` returns `topicMarkdown`.
- `rulesMarkdown` and `topicMarkdown` are the only query content fields that should enter the LLM generation/review reasoning.

Failure degradation: if `query-ui-rules` fails or returns warnings for a Lynx target, continue with XML/DSL, preview image, DSL `CodeGenGuid`, downloaded assets, and project conventions. Record missing or partial rule material as a risk; do not block the D2C workflow solely because local rules are unavailable.

For Non-Lynx platforms, skip this query phase entirely and do not fallback to Lynx rules.

**Code generation best practices:**

1. Read the preview image FIRST to understand the overall visual design
2. Read the XML DSL to get precise structural data and style values
3. Cross-reference image with XML to resolve any ambiguities
4. Use icon `name` attributes from downloaded icons as resource references
5. Preserve ALL text content exactly as-is (never translate)
6. Match colors, font sizes, border-radius, opacity precisely from XML
7. For Lynx, use `rulesMarkdown` and optional `topicMarkdown` as material for a concise natural-language `ruleContext`
8. For Lynx, if generated code depends on rules that differ from generic React/Web intuition, include those rules explicitly in `ruleContext` so the Review LLM does not misjudge valid Lynx code. Examples include List child structure, ScrollView props, native events, and Lynx styling constraints.

For Lynx SVG icons, `download-icons` may return inline `svg_code` with an empty `path`. Render supported SVG with `<svg content={svg_code} style={{ width, height }} />`; use PNG `<image>` fallback only for unsupported SVG tags/effects such as filter or mask.

### Step 4 — Code Review (MANDATORY for Non-H5)

After generating ALL code (for `web`, `ios`, `android`, `lynx`, `universal`), you MUST run verification:

**Note for `web-h5`:** Do NOT run `verify-code` for `web-h5`. The backend API already ensures design-code alignment. Instead, you MUST perform strict self-verification (Quality Assurance) on the rewritten code to ensure it meets the following baseline requirements:

1. **Zero Static Errors:** Ensure the generated code has no ESLint warnings or TypeScript type errors, and type definitions are completely closed-loop.
2. **Dependencies Available:** Ensure all third-party dependencies imported in the code actually exist in the current project. If missing, provide alternatives or use existing dependencies to resolve errors.
3. **Safe Variable Declarations:** Strictly distinguish between TS/JS variables and CSS variables (e.g., CSS Modules). Ensure all used variables and class names are correctly declared and resolvable, with no undefined reference errors.

Once this QA is passed, skip the `verify-code` command and proceed directly to Step 7 (Cleanup). `web-h5` also skips the runtime design-review loop (Steps 5–6) — the backend already aligns design and code.

```bash
codin-d2c verify-code \
  --url "<SAME_FIGMA_URL>" \
  --code-files "<file-spec>" \
  --platform <web|ios|android|lynx|universal>
```

**`--code-files` supports three input formats:**

1. **JSON array** (recommended, most precise):

   ```
   --code-files '[{"path":"/src/Card.tsx","type":"new"},{"path":"/src/App.tsx","type":"modify"}]'
   ```

2. **Type-prefixed comma-separated** (CLI-friendly):

   ```
   --code-files '/src/Card.tsx,modify:/src/App.tsx,new:/src/Card.css'
   ```

3. **Plain comma-separated** (all treated as `new`):
   ```
   --code-files '/src/Card.tsx,/src/Card.css'
   ```

**File ordering matters** — list files in priority order:
main page component FIRST, then large components, then styles, then small/trivial components LAST.

**File type semantics:**

- `new`: Newly created file — full content is sent for review
- `modify`: Changed existing file — only the git diff is sent (more efficient, more focused review)

**Include only:** files you CREATED or SIGNIFICANTLY MODIFIED for this design.
**Exclude:** config files, lock files, unmodified files, utility-only files, test/mock files.

Optional:

- `--code-context <ctx>`: One-liner about framework/styling (e.g., `"React + TailwindCSS, rem units, 1440px desktop"`).
- `--rule-context <text>` or `--rule-context-file <file>`: For Lynx, pass natural-language review guidance that the Agent writes from the final `query-ui-rules` material and the code it actually generated. Do not pass raw query JSON or a structured object.
- `--trace-id <id>`: Request trace ID.

For Lynx, create `ruleContext` yourself before calling `verify-code`; the CLI does not automatically build this text. Write a concise reviewer-facing summary that covers:

- platform expectations such as ReactLynx tags/components and avoiding Web DOM APIs;
- components and capabilities you actually used or intentionally avoided;
- important prop constraints, caveats, examples, assets, and fallback decisions that affected the implementation;
- any Lynx-specific rule that would look unusual to a generic React/Web reviewer, such as List direct-child requirements, ScrollView prop names, native event names, or styling/layout constraints;
- a focused review request, especially must-rule violations, wrong component/prop usage, ignored caveats, and design/XML mismatches.

Do not pass the raw `query-ui-rules` JSON as this value. The verify command only carries your text to the downstream reviewer.

The result contains a Code Review report comparing your code against the design.
Apply **targeted fixes for Critical and Moderate issues only** — do NOT regenerate entire components.

**Call verify-code EXACTLY ONCE.** After receiving the report or fallback checklist and applying targeted fixes/self-checks, do not call it again; if `.d2c_temp/` exists, finish the workflow with cleanup.

If the review service is unavailable, `result.verification_mode` will be
`"fallback_checklist"` with a self-check guide — still exit code 0.

### Step 5 — Runtime Design Review (OPTIONAL, recommended once the app is running)

After Step 4 passes and the user has the app running locally, run `design-review` to
compare the live page against the original Figma design **at runtime**. This catches drift
that static review cannot see: pixel-level visual differences, token mismatches in the
actually-rendered styles, and asset / typography regressions.

Skip this step when there is no running app to point at, when the platform is `web-h5`
(backend-generated code is already aligned), or when the user has opted out.

```bash
codin-d2c design-review \
  --url "<SAME_FIGMA_URL>" \
  --directory "<SAME_PROJECT_DIR>" \
  --live-screenshot "<SAME_PROJECT_DIR>/.d2c_temp/design-review/inbox/<screenshot>.png" \
  --code-dir "<SAME_PROJECT_DIR>" \
  --code-context "React + CSS Modules, rem units, 1440px desktop"
```

**How to provide the running UI — decide in this order.** `design-review` reads
**only a file on disk** (`--live-screenshot`) or a **URL** (`--live-url`); it never
reads the OS clipboard or an image embedded in the conversation.

1. **User gave a file PATH** (an absolute image path, or one you can copy into the
   project) → use `--live-screenshot <abs>`. If the path is outside the project, copy it
   into `<directory>/.d2c_temp/design-review/inbox/` first. (Codex `codex -i <image>` or
   a named local file is this case.) Keep the original extension — the pipeline detects
   the real format by magic bytes.
2. **User gave the exact running-page URL** and its login/modal/tab/scroll state is
   correct → use `--live-url <url>` (see the self-check below).
3. **Review requested, you have NO path and NO URL, and the user pasted/attached an
   image in chat** (or said "I gave you the screenshot / see the image I sent") →
   coding agents (Claude Code, Codex, Trae) **cannot write a chat-pasted image to disk**,
   so recover it from the OS clipboard with `paste-screenshot`:
   1. Ask the user to make sure that runtime screenshot is the LAST thing they copied
      (the shot they just took, or copy the image from IM/Preview).
   2. Run `codin-d2c paste-screenshot --directory <abs> --reveal`. It reads the OS
      clipboard (**same machine only**), enforces the **single-image rule** (2+ images →
      error, ask them to copy just one), validates the bytes, saves the FULL-RES original
      into the inbox, and — with `--reveal` — opens it in the OS viewer so the user can
      eyeball it. The success envelope carries `result.saved_path`, `width`, `height`,
      `sha256`, and a `next_actions` entry already pointing at `design-review`.
   3. Echo that fingerprint back in ONE line: "👇 grabbed runtime screenshot \<WxH\>,
      sha256 \<8 chars\>; continuing the review — stop now if this is the wrong image."
      Do NOT block on a Y/N confirm — the user stopping the session is the veto.
   4. Run `design-review` with `--live-screenshot <saved_path>`. If the user stops the
      session, only a cheap grab was wasted; if not, the review runs normally.
4. **The grab fails** (clipboard empty / not an image / 2+ images / remote machine) **or
   there is no image at all** → ask the user for a runtime screenshot of the running app:
   an **absolute file path** (preferred), or to **copy/paste** the screenshot and retry.
   Never guess a localhost URL, and never search `$TMPDIR` / `/tmp` / `~/.codex` / browser
   cache for a "recent"/"similar" image — a wrong image silently corrupts the pixel-diff
   and the AI analysis.

`paste-screenshot` is the ONLY command that reads the clipboard; `design-review` stays
pure (it accepts only `--live-screenshot` / `--live-url`). A bad `--live-screenshot`
(missing / relative / empty, or bytes that are not a real PNG/JPEG/WebP) is rejected by
`design-review` with the supported intake methods listed — fix the path rather than
retrying blindly.

**Flag mapping (sugar over `--impl`):** `--live-screenshot <abs>` ≡
`--impl '{"kind":"screenshot-path","path":"<abs>"}'`; `--live-url <url>` ≡
`--impl '{"kind":"web-url","url":"<url>"}'`. Pass `--impl '<json>'` directly only for the
advanced case; the two sugar flags cover the common ones. `screenshot-base64`,
`ios-simulator`, and `android` kinds are not exposed — use a screenshot path instead.

Prefer PNG (lossless). If the user only has JPG/WebP, use it directly — do not ask them to
run `sips`, `magick`, or any external conversion. Only `.png` / `.jpg` / `.jpeg` / `.webp`
are accepted; there is no inline / base64 channel.

**`--live-url` self-check (hard rule):** use `--live-url` only when one of these is true:

- the user explicitly supplied the full target page URL (including path/query/hash when
  relevant) and confirmed login/modal/tab/scroll state;
- the Agent implemented this exact Web page, started the dev server itself, opened the
  browser itself, and knows the target URL with certainty.

Never infer `http://localhost:3000` from `platform=web`, never derive a route from Figma
node names, and never fall back from a failed manual screenshot to a guessed `--live-url`.

**`--code-dir` is strongly recommended** (absolute code root): it enables the code-token diff
with styles extracted from the actually-generated code and feeds a precise code snippet into AI
analysis and the shareable report. Without it, code-token-diff is unavailable and analysis
quality drops.

**Outputs (in `result`, also surfaced in `next_actions`):**

- `report_url`: preferred visual URL — the shareable remote URL when upload succeeds, otherwise
  `file://<local_report_path>`.
- `remote_report_url`: shareable remote URL, present only when upload succeeds; this is the input
  `design-review-fix` accepts.
- `local_report_path`: absolute self-contained HTML report; always present (offline fallback).
- `analysis_path` / `issues_path`: absolute `analysis.json` and per-issue JSON directory. On the
  same machine you can fix directly from these — no further command needed.
- `match_percentage` / `diff_percentage`, `issue_count` (`{ total, critical, warning, info }`),
  `signal_availability`, and analysis telemetry.

After the command, read `next_actions` for the contextual next step (fix, re-run, or cleanup).

### Step 6 — Fix Design Review Issues (when critical / warning issues exist)

Two ways to turn Step 5 issues into code fixes:

- **From the local run (default on the same machine):** read `analysis_path` (`analysis.json`)
  and `issues_path` (per-issue JSON) from Step 5 and apply targeted fixes directly. Step 5 already
  produced everything you need — no extra command.
- **From a report URL via `design-review-fix`:** when you hold a Design Review report URL —
  `remote_report_url` from Step 5, or a link the user pastes — run `design-review-fix` to get an
  auto-located, unified-diff fix report:

```bash
codin-d2c design-review-fix \
  --report-url "https://design-space.bytedance.net/design-review/report/<id>" \
  --code-root "<SAME_PROJECT_DIR>" \
  [--severities critical,warning] \
  [--issue-ids 12,15] \
  [--output "<abs>.md"]
```

`design-review-fix` is **standalone** — it does not require `design-review` to have run; a user can
hand you a report URL on its own. It takes the issue list **from the report URL only** (a local
`analysis.json` is **not** accepted as the source), but it **does read your `--code-root` source**
to resolve each issue to `file:line` and render the diffs. Accepts internal
(`https://design-space.bytedance.net/design-review/report/<id>`) and legacy
(`https://dreamina.world/DesignReview/report/<id>`) URLs; both parse the same way. It is
**suggestion-only and never writes source files**.

**Outputs:** `report_path` (markdown with unified-diff blocks), `per_issue_dir` (per-issue JSON),
and the telemetry counts `total_suggestions` / `high_confidence_count` / `medium_confidence_count`
/ `low_confidence_count` / `skipped_info_count`; `patched_files` is always `[]`. High-confidence
diffs come from an exact `codeFile:line` hit, medium from a unique grep / file-scan match, low when
nothing or multiple candidates matched (candidate locations are listed for manual review). The
default severity filter is `critical,warning`; `info` is skipped unless requested. **Apply the
suggested diffs manually in the IDE.**

**Loop budget (CRITICAL — cap at 3 rounds):**

1. Run `design-review` (Step 5).
2. Fix the issues (Step 6): from local `analysis_path` / `issues_path`, or via `design-review-fix`
   when you have a report URL.
3. Apply targeted fixes manually.
4. Restart the app, capture a **fresh** screenshot, then re-run `design-review` (round 2).
5. Repeat until `issue_count.critical === 0`.
6. **Stop after 3 rounds even if critical issues remain** and escalate to a human reviewer with the
   latest `local_report_path`. Looping past round 3 burns tokens without converging — the failure
   usually means the issue is ambiguous or needs a design / product decision.

If you are fixing from just a report URL with no running app, apply the diffs, report back to the
user, and run the runtime verification later once a running app is available.

### Step 7 — Cleanup Temp Files

After verification (and the design-review loop, if you ran it) is complete:

```bash
codin-d2c cleanup-temp --directory "<SAME_PROJECT_DIR>"
```

This removes the `.d2c_temp/` folder created in Step 1. The `design-review/`
subdirectory (local reports, inbox screenshots, per-run artifacts) is treated as D2C-owned
and can be cleaned without `--force`; use `--force` only if unrelated files exist in the temp
directory.

Do NOT clean up before `verify-code` completes, before the design-review loop (Steps 5–6) has
settled, or before the user has confirmed the final result.
For file-based CLI workflows, cleanup is the final D2C workflow step after verification and targeted fixes.

## Guardrails

1. **Check CLI version BEFORE the workflow starts** — `codin-d2c` must be >= this Skill's frontmatter `version`; otherwise use `npx -y --registry=https://bnpm.byted.org --package @byted/codin-d2c-mcp@latest` or upgrade first.
2. **Detect platform FIRST** — inspect the project before calling any command. Wrong platform is worse than `universal`. For web projects, apply the scoring algorithm to distinguish `web-h5` from `web`.
3. **For Lynx, query rules in Step 3 only** — after XML DSL, preview image, and DSL `CodeGenGuid` are available, use `discover`, `implement`, and optional `generation-detail-example` with explicit Agent-selected `components`; deep-dive `queryKeys` must be copied from `deepDive.availableTopics[].queryKey`.
4. **Always use absolute paths** for `--directory` and `--code-files`.
5. **Read BOTH XML and preview image** from Step 1 before writing any code ( `web-h5` skips this).
6. **Call `verify-code` AFTER all code generation** — it is mandatory for the standard workflow, not optional. Call it EXACTLY ONCE. `web-h5` does NOT use `verify-code` because the backend `analyze-generate-v2` already ensures design-code alignment; quality is guaranteed by Step 3 (rewrite) instead.
7. **For Lynx, pass ruleContext into `verify-code`** — use LLM-written natural-language guidance based on `rulesMarkdown`, optional `topicMarkdown`, and the actual generated code. Include Lynx-specific rules that differ from generic React/Web intuition so the Review LLM has the required context.
8. **Do NOT call `cleanup-temp` prematurely** — for the standard workflow, temp files are needed for `verify-code` and the runtime design-review loop, so cleanup must happen after verification and after the design-review loop (Steps 5–6) settles. For `web-h5`, cleanup must happen after Step 3 (rewrite) is complete, not before.
9. **Use the same `--figma-url` / `--url`** across all commands for the same design.
10. **Order `--code-files` by importance** — main page first, trivial components last.
11. **Mark file types correctly** — use `modify` for changed existing files so only diffs are reviewed.
12. **Never use deprecated query params** — do not pass `--dsl-snippet`, `--signals`, `--rule-types`, or legacy stages `routing` / `implementing` / `verifying`.
13. **Skip rule query for Non-Lynx** — for Web/Web-H5/iOS/Android/Universal, follow DSL `CodeGenGuid`, preview image, and project conventions; do not use Lynx rules as fallback.
14. **Default to a saved screenshot for runtime design-review, and follow the intake decision order** — prefer `--live-screenshot <abs>` (a file on disk, e.g. under `.d2c_temp/design-review/inbox/`). If the user only pasted/attached an image in chat and you have no file path, you can't save it yourself — run `codin-d2c paste-screenshot --directory <abs> --reveal` to recover it from the OS clipboard, then pass its `saved_path` as `--live-screenshot`. Use `--live-url` only when you know the exact running page URL and its state; never guess `http://localhost:3000`, never derive a route from Figma node names, never search temp dirs for a "similar" image, and never silently switch to `--live-url` after a screenshot attempt fails. `design-review` reads a file on disk or a URL — there is no base64 channel.
15. **Cap the runtime design-review loop at 3 rounds** — `design-review` → fix (from local `analysis_path` / `issues_path`, or via `design-review-fix` when you hold a report URL) → apply diffs manually → restart app → re-run is one round. Stop when `issue_count.critical === 0`; if 3 rounds have not converged, stop and escalate to a human reviewer with the latest `local_report_path` instead of burning more tokens.

## Error Recovery

| Exit Code | Meaning                          | Action                                                            |
| --------- | -------------------------------- | ----------------------------------------------------------------- |
| 0         | Success                          | Follow `next_actions`                                             |
| 1         | General error                    | Read `fix` field for guidance                                     |
| 2         | Argument error                   | Check command parameters; run `codin-d2c schema --command <name>` |
| 3         | Auth error                       | Run `codin-d2c auth verify`, then reconfigure tokens              |
| 4         | Retryable (rate limit / network) | Wait 30 seconds, then retry the same command                      |

On any error, the JSON response always includes a `fix` field with natural-language
recovery steps. Follow them.

## Command Quick Reference

| Command          | Purpose                                                                                                                   | Required / Mode Options      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `query-ui-rules` | Query Lynx rules after XML DSL, preview, and `CodeGenGuid`; returns `componentsMenu`, `rulesMarkdown`, or `topicMarkdown` | `--platform`                 |
| `get-figma-data` | Fetch design XML + preview                                                                                                | `--url`, `--directory`       |
| `download-icons` | Download icon assets; prefer `--icons-file` after reading XML, or use automatic `--figma-url` mode for full/original-name downloads | `--directory` plus `--icons-file` or `--figma-url` |
| `verify-code`    | Code Review vs design                                                                                                     | `--url`, `--code-files`      |
| `paste-screenshot` | Step 5 intake bridge — the ONLY command that reads the clipboard. Use when `design-review` needs a live screenshot but the user gave NO file path / URL and pasted an image in chat (coding agents can't save a chat image to disk). Reads the OS clipboard, validates magic bytes, saves the full-res original to `.d2c_temp/design-review/inbox/`, and with `--reveal` opens it in the OS viewer; prints `saved_path` / `width` / `height` / `sha256`. Same machine only; single-image rule (2+ images → error); never searches temp dirs to guess. Then pass `saved_path` to `design-review --live-screenshot`. | `--directory` (`--reveal` optional) |
| `design-review`  | Runtime visual + code review of the **running app** vs Figma. Prefer `--live-screenshot` (save the screenshot, pass its absolute path); `--live-url` only when the exact running URL is known. Cap the fix loop at 3 rounds. | `--url`, `--directory`, one of `--live-screenshot` / `--live-url` / `--impl` |
| `design-review-fix` | Turn a Design Review report URL into located, unified-diff fix suggestions (suggestion-only). Standalone; issue list from the URL, reads `--code-root` source to render diffs. | `--report-url`, `--code-root` |
| `cleanup-temp`   | Remove `.d2c_temp/`                                                                                                       | `--directory`                |
| `auth verify`    | Check token validity; resolves `flag → env → cache → error` and write-throughs flag/env tokens to the user-level cache    | (none)                       |
| `auth status`    | Read-only: per-token resolution source (`flag\|env\|cache\|missing`) + masked value + cache path; writes nothing           | (none)                       |
| `auth clear-cache` | Clear the user-level token cache (`--token codin\|figma\|all`, default `all`); explicit removal runs even under opt-out   | `--token`                    |
| `commands`       | List all commands (JSON)                                                                                                  | (none)                       |
| `schema`         | Get JSON Schema for a command                                                                                             | `--command <name>`           |

## Self-Discovery

If you need detailed parameter schemas for any command:

```bash
codin-d2c schema --command get-figma-data
```

To list all available commands:

```bash
codin-d2c commands
```

`codin-d2c commands` also returns `result.version`, which MUST be used for the
version compatibility check described in Step -1.

## Defaults

- Platform defaults to `"universal"` — always try to detect the correct platform first.
- Preview image is included by default — use `--no-image` to skip.
- XML mode defaults to `"prompt_and_xml"` — includes generation guidance with XML.
- XML content is saved to `.d2c_temp/` files by default — use `--inline` only for small designs.
- `get-figma-data` writes XML into the CLI's local cache for 2 hours in XML modes; `raw_html_only` skips this local XML icon cache. `download-icons` reads XML through `--figma-url <same-url>` in automatic mode, or uses `--icons-file <absolute-json-file>` in explicit mode.
- If the local XML cache is missing or expired, automatic `download-icons` can fall back to the server XML cache only when D2C/Figma tokens are configured; otherwise rerun `get-figma-data` with the same Figma URL.
- `design-review` defaults to `--live-screenshot` (an absolute path to a saved screenshot of the running page, preferably under `.d2c_temp/design-review/inbox/`); `--live-url` is only for when you know the exact running page URL and its state. There is no base64/inline image channel.
- When the user only pasted/attached the screenshot in chat (no file path, no URL), `codin-d2c paste-screenshot --directory <abs> --reveal` is the only command that recovers it from the OS clipboard and writes the full-res original into the inbox — then pass its `saved_path` to `design-review --live-screenshot`. It is same-machine-only, enforces a single-image rule, and never searches temp dirs to guess a "similar" image.
- `design-review-fix` is suggestion-only — it reads the report URL plus `--code-root` source and writes a unified-diff report, never source files. Cap the design-review → fix → re-run loop at 3 rounds.
- All logs go to stderr — stdout is clean JSON by default, except the explicit `query-ui-rules --format markdown` plain Markdown mode.
