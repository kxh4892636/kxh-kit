// TODO

# vscode

## 插件

- ssh 相关
- tailwindcss
- bookmarks
- code runnder
- code spell check
- es7——react
- eslint
- git history
- intellicode
- liver server
- markdown all in one
- paste image
- prettier
- remote 相关
- vim
- vscode-icons

## 配置文件

```json
{
  // 主题与外观
  "workbench.colorTheme": "Light+",
  "workbench.iconTheme": "vscode-icons",
  // 编辑器字体与显示
  "editor.fontFamily": "'Maple Mono NF CN', Consolas, 'Courier New', monospace",
  "editor.wrappingStrategy": "advanced",
  "editor.wordWrap": "on",
  "editor.rulers": [80],
  "workbench.editor.wrapTabs": true,
  // 终端配置
  "terminal.integrated.defaultProfile.windows": "Git Bash",
  // 代码运行器 (Code Runner)
  "code-runner.runInTerminal": true,
  "code-runner.executorMap": {
    "javascript": "node --experimental-specifier-resolution=node",
    "typescript": "tsx"
  },
  // 编辑器智能编辑行为
  "editor.linkedEditing": true,
  // 代码格式化
  "editor.formatOnSave": true,
  "editor.formatOnSaveMode": "file",
  "editor.defaultFormatter": "oxc.oxc-vscode",
  "oxc.fmt.configPath": "./vite.config.ts",
  "editor.codeActionsOnSave": {
    "source.fixAll.oxc": "explicit"
  },
  "[javascript]": {
    "editor.defaultFormatter": "oxc.oxc-vscode"
  },
  "[javascriptreact]": {
    "editor.defaultFormatter": "oxc.oxc-vscode"
  },
  "[typescript]": {
    "editor.defaultFormatter": "oxc.oxc-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "oxc.oxc-vscode"
  },
  "[markdown]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  // 文件管理
  "files.autoSave": "afterDelay",
  "explorer.copyRelativePathSeparator": "/",
  // JavaScript / TypeScript 配置
  "js/ts.updateImportsOnFileMove.enabled": "always",
  // Markdown 配置
  "markdown.updateLinksOnFileMove.enabled": "always",
  // 图片粘贴
  "pasteImage.path": "${currentFileDir}/images",
  // vscode 内置 AI
  "chat.agent.enabled": false,
  "chat.disableAIFeatures": true,
  // trae 配置
  "trae.privacy.mode": true,
  "trae.tab.enablePartialAccept": true,
  "trae.tab.enableAutoImport": true,
  "trae.tab.cue": true,
  "remote.autoForwardPortsSource": "hybrid",
  "remote.SSH.remotePlatform": {
    "123.57.92.26": "linux"
  }
}
```
