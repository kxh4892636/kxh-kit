# pi 常见问题

## pi 插件的能力边界

- 适用条件与现象：需要让 pi 做内建能力之外的事（自动改名、拦截输入、注册工具/命令、发现嵌套 skill 等）。
- 原因：pi 以扩展接缝（事件 + 方法面）开放能力，不能改动 pi 本体。
- 解决方法：以工作区独立包开发，`package.json` 的 `pi.extensions` 指向入口 TS，经 `pi install` 安装；用 `pi.on()` 挂事件、`pi.registerTool()` / `pi.registerCommand()` 扩展能力。
- 验证：`pi --extension <path>` 本地加载可直接调试；安装后经真机会话验证。
- 来源：pi `docs/extensions.md`、`docs/packages.md`；本域 ADR-0001、ADR-0002。

## 扩展 handler 会不会阻塞首轮对话

- 适用条件与现象：在 `input` 等前置事件里做网络调用（如再调一次模型）时，担心拖慢用户提交。
- 原因：`input` 处理器会被 `await` 后才启动 run，同步等待会串行阻塞。
- 解决方法：处理器内以 fire-and-forget 方式发起耗时逻辑，立即返回 `{ action: "continue" }`；仅把必须在提交前完成的文本变换放进 `transform`。
- 验证：真机观察提交到模型首响的时间未因附加逻辑增加。
- 来源：pi `docs/extensions.md`「Respect the runtime lifecycle」；`pi-nested-skill` 的 `input` 用法。
