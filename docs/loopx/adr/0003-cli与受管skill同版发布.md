# CLI 与受管 skill 同版发布

`loopx` 将 `loop-x` 和 `loop-x-cli` 作为受管 skill 内置于 npm 包，skill 版本始终等于分发它的 CLI 版本，不建立独立发布流。这使 `self update` 能以一个版本原子协调 CLI 与已安装 skill，避免兼容矩阵；代价是只修改 skill 也需要发布新 CLI 版本。内容哈希只用于识别安装状态和本地修改，不构成第二套版本。

**Considered Options**: 每个 skill 独立语义版本（被拒绝——会引入版本矩阵和额外发布协调）；只比较文件哈希（被拒绝——无法表达可查询的发布版本）。
