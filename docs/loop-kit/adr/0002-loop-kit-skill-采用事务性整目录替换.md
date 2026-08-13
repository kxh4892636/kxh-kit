# Loop Kit skill 采用事务性整目录替换

`@kxh4892636/loop-kit` 将 `.agents/skills/loop-kit` 视为分发包独占目录。更新时先完整准备并校验新目录，再事务性替换目标中的整个目录；成功后删除不在新版本中的旧 skill，失败时恢复原目录。CLI 以包含 `SKILL.md` 的目录为一个 skill，单独报告已删除 skill 数；被一并清理的其他陈旧内容不进入该计数。该决定取代 ADR-0001 对 skill 目录采用覆盖式合并的部分，因为保留目标额外文件会留下已从 Loop Kit 删除或重命名的 skill，使目标目录混合多个版本；`DOMAIN.md` 继续使用发布版本整文件替换，`AGENTS.md` 继续只同步 `GENERAL RULES` 和 `LOOP KIT` 两个受管标记块。
