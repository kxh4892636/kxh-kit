---
id: 4aa876ce-d550-4ae6-9c27-b10ef9dee445
---

# grid 布局

## grid 布局

### 组成部分

- rows;
- columns;
- gutters: rows/columns 之间的空隙;

### 示意图

![示意图](./images/2022-08-08-10-17-34.png)

### grid 属性值

- display: grid 创建 grid container;

```css
.container {
  display: grid;
}
```

## grid-template-rows 属性

- grid-template-rows: 设置 grid 行名和行轨道大小;

```css
.container {
  /* 使用 grid-auto-rows 属性 */
  grid-template-rows: none;

  /* length 类型 */
  /* percentage 类型, 设置各轨道 flex 比例系数, fr 后缀 */
  /* flex 类型 */
  grid-template-rows: 1fr 2fr 1fr;

  /* 设置尽可能大的最大宽度, 最小宽度 */
  grid-template-rows: 10px max-content;
  grid-template-rows: 10px min-content;

  /* minmax(min, max) 函数 */
  grid-template-rows: 10px minmax(min, max);
  /* 单独使用视为 minmax(min-content, max-content) */
  grid-template-rows: 10px auto;
  /* repeat() 函数 */
  grid-template-rows: 10px repeat(2, 1fr);

  /* 设置 grid 行名, 名称为除保留字之外的有效字符串 */
  grid-template-rows: [linename1] 100px [linename2 linename3];
}
```

## grid-template-columns 属性

- grid-template-columns: grid-template-rows 的列方向版本;

## grid-auto-rows 属性

- grid-auto-rows: 设置隐式行轨道大小;
- 当 grid-template-rows 缺省或为 none 时生效;
- 属性值同 grid-template-rows 属性;

```css
#grid {
  display: grid;
  grid-auto-rows: 100px;
}
```

## grid-auto-columns 属性

- grid-auto-columns: grid-auto-rows 的列方向版本;

## repeat() 函数

### 作用

- repeat(): grid-template-rows/columns 的重复 track list 简写;

- repeat count + tracks;
  - repeat count;
    - int;
    - auto-fill;
    - auto-fit;
  - tracks;
    - tracks size;
- 可存在多个 tracks sizes;
  - 空格分隔;
  - 表示 abc, abc 形式, 依次重复多个 tracks sizes;

```css
#container {
  display: grid;
  grid-template-columns: repeat(2, 50px 1fr) 100px;
}
```

### 尽可能多的列

- 使用 repeat() 函数;
- 使用 auto-fill;
- 使用 minmax();
  - 第一个参数为设置的最小值;
  - 第二个参数为 1fr, 自动拉伸;

```css
.container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}
```

### auto-fill 和 auto-fit

- 相同之处;
  - 设置重复次数为尽可能大的数字;
  - 使对应方向不会溢出;
  - 最小为 1;
- 不同之处;
  - 当容器宽度大于所有重复子元素的总宽度;
  - auto-fill 保留空白通道;
  - auto-fit 折叠空白通道;
    - 空白通道空间平均分配给其他通道;

## minmax() 函数

- minmax(min, max): 设置 grid track 的最小值和最大值;

```css
#container {
  display: grid;
  grid-template-columns: minmax(min-content, 300px) minmax(200px, 1fr) 150px;
}
```

## 基于网格线的放置

### grid-column 属性

#### 作用

- grid-column: 设置 grid item 的列向位置和跨度;

##### 定位机制

![示意图](./images/2022-08-08-14-28-22.png)

##### 语法格式

```css
#item {
  grid-column: 2 / 4;
}
```

##### 成分属性

- grid-column-end;
- grid-column-start;

##### 简写机制

- 1 value;
  - grid-column-start;
- 2 value;
  - grid-column-start / grid-column-end;

### grid-column-start 属性

- grid-column-start: 设置 grid item 的列向起始位置;

```css
#item {
  /* 默认值, 等同于 span */
  grid-column-start: auto;
  /* 正数: 基于正数第 i 列 */
  /* 负数: 基于倒数第 i 列 */
  grid-column-start: 2;
  grid-column-start: -2;

  /* span [int], 表示横跨 int 列, int 缺省为 1 */
  /* 单独使用 span, `grid-column-start: span 2` 等效于 `grid-column: i / span 2` */
  grid-column-start: span 2;

  /* custom-ident 列名 */
  grid-column-start: test;
}
```

### grid-column-end 属性

- grid-column-end: grid-column-start 的终止位置版本;

### grid-row 属性

- grid-row: grid-column 的行方向版本;

## 网格区域命名

### grid-template-areas 属性

#### 作用

- grid-template-areas: 命名 grid container 的网格区域;
  - 与 grid-row/grid-column/grid-area 联合使用;
  - 同一行同一引号包裹;
  - 同一行不同列空格分隔;
  - 不同行引号分隔;

```css
#page {
  display: grid;
  width: 100%;
  height: 250px;
  grid-template-areas:
    "a a ."
    "a a ."
    ". b c";
  grid-template-rows: 50px 1fr 30px;
  grid-template-columns: 150px 1fr;
}
```

##### 原则

- 一旦使用, 必须填充所有网格;
- 使用 `.` 表示该网格不命名;
- 命名网格区域必须为矩形;
- 同一命名网格必须相连;

### grid-area 属性

- grid-area: 指定 grid item 的命名网格区域;
- grid-area: 设置 grid item 的行列位置和跨度;
  - grid-row-start / grid-column-start / grid-row-end / grid-column-end;

```css
/* 指定 grid item 的命名网格区域 */
#page {
  display: grid;
  width: 100%;
  height: 250px;
  grid-template-areas:
    "a a ."
    "a a ."
    ". b c";
  grid-template-rows: 50px 1fr 30px;
  grid-template-columns: 150px 1fr;
}
#item1 {
  grid-area: a;
}
/* 设置 grid item 基于 grid column/row 的位置和尺寸 */
#item1 {
  grid-area: 2 / 2 / auto / span 3;
}
```
