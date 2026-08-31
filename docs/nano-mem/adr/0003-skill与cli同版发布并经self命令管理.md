# skill 与 CLI 同版发布并经 self 命令管理

nano-mem skill 作为受管 skill 内置在 `nm` CLI 包内（`packages/nano-mem/skills/nano-mem/`），版本始终等于 CLI 版本，经 `nm self skill` 安装、检测、更新或卸载到工作区 `.agents/skills`；该模式源于 LoopX 的既定设计（[loopx ADR-0003](../loopx/adr/0003-cli与受管skill同版发布.md)），nano-mem 作为第二个采纳者在此记录本域承诺。代价是修改 skill 需要发布新 CLI 版本；没有独立发布流，也不构成兼容矩阵。

**Considered Options**:

- skill 独立语义版本（被拒绝——引入版本矩阵与发布协调，与 loopx 结论一致）。
- 仅比较文件哈希（被拒绝——无法表达可查询的发布版本；内容哈希只识别安装状态与本地修改）。
