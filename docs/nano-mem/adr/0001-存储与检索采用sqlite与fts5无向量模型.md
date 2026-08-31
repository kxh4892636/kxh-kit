# 存储与检索采用 sqlite + FTS5，无向量模型

nano-mem 的记忆存储与检索使用 SQLite（Node 内置 `node:sqlite`，`engines >= 24`）的 FTS5 全文索引，不引入向量模型或向量搜索；这与 mem0 的「向量检索 + BM25 融合」正统形态刻意不同。决定依据：避免 embedding 依赖与自托管服务，本地零网络即可工作，检索结果仍然以相关性与记忆强度排序。

**Considered Options**:

- 向量库（Qdrant 等）+ 关键词融合（被拒绝——引入部署与模型依赖，与本域"本地、零向量"目标冲突）。
- `better-sqlite3`（被拒绝——原生编译依赖，`node:sqlite` 已实测 FTS5/bm25 可用）。
- 自研倒排/前缀索引（被拒绝——FTS5 成熟且支持 bm25 排序，自研成本高收益低）。

**Consequences**:

- 中文检索采用 FTS5 unicode61 + CJK 字符切分预处理（写入与查询同构），排除了 ≤2 字查询失败的 trigram tokenizer。
- 语义接近性（同义词、改写）无法匹配，只能依赖关键词命中——检索质量依赖文本措辞。
- 记忆库上限受 SQLite 文件与 FTS 索引约束，面向单用户/单仓库规模。
- `engines >= 24.0.0`：`node:sqlite` 的 FTS5 支持实测于 v24.19 通过。
