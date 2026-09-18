---
id: a8f7e7b3-b815-4f19-a766-4c23faaa3537
---

# Canvas

## 如何取得画布上下文并导出图像？

```html
<canvas id="drawing" width="200" height="200">A drawing of something.</canvas>
```

```js
const drawing = document.getElementById("drawing");
if (drawing.getContext) {
  const context = drawing.getContext("2d");
  const imgURI = drawing.toDataURL("image/png"); // 同源限制
}
```

## save 与 restore 保存了什么？

- `save()`: 把当前绘图状态压入暂存栈;
- `restore()`: 从暂存栈弹出并恢复;
- 用途: 局部改样式后回滚, 避免状态泄漏;

```js
context.fillStyle = "#ff0000";
context.save();
context.fillStyle = "#0000ff";
context.fillRect(0, 0, 100, 200);
context.restore(); // 恢复 fillStyle 为 "#ff0000"
```

## 如何绘制矩形与路径？

```js
context.strokeStyle = "red";
context.fillStyle = "#0000ff";
context.fillRect(10, 10, 50, 50); // 填充矩形
context.strokeRect(10, 10, 50, 50); // 描边矩形
context.clearRect(40, 40, 10, 10); // 擦除区域

context.beginPath();
context.arc(100, 100, 99, 0, 2 * Math.PI, false); // 圆心、半径、起止弧度
context.moveTo(194, 100);
context.lineTo(100, 15);
context.closePath();
context.stroke(); // 用 strokeStyle 描边
context.fill(); // 用 fillStyle 填充
context.isPointInPath(x, y); // 点是否在路径上
```

## 如何绘制文本？

```js
context.font = "bold 14px Arial";
context.textAlign = "center";
context.textBaseline = "middle";
context.fillText("12", 100, 20, 10); // 最大宽度 10, 用 fillStyle
context.strokeText("12", 100, 20, 10); // 用 strokeStyle
context.measureText("Hello world!"); // 依据当前字体属性测量
```

## 阴影、渐变、图像与图案如何绘制？

```js
context.shadowOffsetX = 5;
context.shadowOffsetY = 5;
context.shadowBlur = 4;
context.shadowColor = "rgba(0, 0, 0, 0.5)";

const linear = context.createLinearGradient(30, 30, 70, 70);
linear.addColorStop(0, "white");
linear.addColorStop(1, "black");
context.fillStyle = linear;

const radial = context.createRadialGradient(55, 55, 10, 55, 55, 30);
context.createPattern(image, "repeat"); // 同 background-repeat
context.drawImage(image, 50, 10, 20, 30); // 目标位置与缩放
context.drawImage(image, 0, 10, 50, 50, 0, 100, 40, 60); // 裁剪后绘制
```

## 如何读写像素与做合成变换？

```js
const imageData = context.getImageData(10, 5, 50, 50);
const [red, green, blue, alpha] = imageData.data;
context.putImageData(imageData, 0, 0);

context.globalAlpha = 0.5; // 全局透明度
context.globalCompositeOperation = "source-over"; // 默认: 新图形覆盖原图形

context.rotate(1); // 围绕原点旋转
context.scale(2, 0.5); // 缩放
context.translate(10, 20); // 移动原点
context.setTransform(1, 2, 1, 2, 1, 1); // 重置矩阵后再变换
context.transform(1, 2, 1, 2, 1, 1); // 在现有矩阵上叠加
```

- 合成模式: `source-in`/`source-out`/`source-atop`/`destination-*` 控制新旧图形重叠区域的取舍, `lighter` 叠加变亮, `copy` 完全取代, `xor` 重叠区异或;
