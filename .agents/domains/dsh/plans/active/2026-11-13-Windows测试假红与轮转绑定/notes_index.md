# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-修掉Windows上假红的单测](001-修掉Windows上假红的单测.md) | layering.test.ts 用 URL.pathname 拿源码目录、plan-log.test.ts 用 POSIX 字面量做 fixture，两处在 Windows 上假红；改成平台无关写法并让 pnpm test 在 Windows 上全绿。 | — |
| [002-查清轮转绑定到已归档Plan的成因](002-查清轮转绑定到已归档Plan的成因.md) | 查清轮转继承旧绑定、Plan 迁 reference 后绑定不失效，导致新会话把已归档的 music Plan 当成 active 并重建幽灵目录的原因与修法。 | 001-修掉Windows上假红的单测 |
