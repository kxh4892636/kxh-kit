# Anki

通过 AnkiConnect add-on 控制本地 Anki 桌面应用的业务域。

## Language

**AnkiConnect**:
Anki 的第三方 add-on，在 localhost:8765 暴露 HTTP API，是外部程序控制 Anki 的唯一通道。

**Note**:
Anki 中的内容单元，由若干 field 组成，属于某个 Model；一个 Note 可生成多张 Card。
_Avoid_: 卡片（指 Note 时）

**Card**:
由 Note 按其 Model 的模板生成的复习单元，有独立的调度状态（due、new、learning、suspended、buried）。

**Deck**:
Card 的分组容器，支持 `Parent::Child` 层级。
_Avoid_: 牌堆

**Model**:
Note 的类型定义（note type），包含 fields、卡片模板（Front/Back HTML）与 CSS。
_Avoid_: 模板（指 Model 整体时）

**Essential 工具**:
操作 Anki 数据（Deck/Note/Tag/媒体/Model/统计/复习）的工具能力，与驱动桌面界面的 GUI 工具相对。

**GUI 工具**:
驱动 Anki 桌面界面动作的工具能力（guiBrowse、guiEditNote 等），与操作数据的 Essential 工具相对。
