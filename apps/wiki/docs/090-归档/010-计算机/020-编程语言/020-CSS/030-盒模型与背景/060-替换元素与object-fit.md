---
id: 8e32979b-4629-413a-8b5a-6b10e2b87672
---

# 替换元素与 object-fit

## 替换元素是什么？

- 替换元素: 内容由外部资源替换的元素;
- 边界: CSS 控制其外部尺寸与位置, 不控制内部内容布局;
- 常见: 图片相关标签、视频相关标签;

## 如何调整替换元素的尺寸？

- `max-width`/`max-height`: 限制最大尺寸;
- `object-fit`: 控制内容在盒内的适配方式;

## 替换元素默认是否拉伸？

- 默认: 不拉伸, 保持内容固有尺寸;
- 强制: 显式设置 width/height 才拉伸;

```css
img {
  width: 100%;
  height: 100%;
}
```

## object-fit 各取值有何区别？

```css
img {
  object-fit: none; /* 原始尺寸 */
  object-fit: contain; /* 保留纵横比, 尽可能放大, 保留空白 */
  object-fit: cover; /* 保留纵横比, 填满容器, 多余部分裁剪 */
  object-fit: fill; /* 不保留横纵比, 填满容器 */
  object-fit: scale-down; /* 取 none 和 contain 中较小的尺寸 */
}
```
