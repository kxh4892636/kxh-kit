---
id: 1f8d3d1a-7eae-42d4-9603-8c6139da477e
---

# Hertz 响应渲染与 JSON

## 渲染 API

- `c.JSON(code, obj)`: JSON 渲染，默认转义特殊 HTML 字符;
- `c.PureJSON`: 按字面编码 HTML 字符;
- `c.IndentedJSON`: 缩进美化输出;
- `c.String(code, format, args...)`: 文本渲染;
- `c.Data(code, contentType, []byte)`: 二进制数据，需自行设置 Content-Type;
- `c.HTML(code, name, obj)`: 模板渲染;
- `c.ProtoBuf(code, obj)`: protobuf 渲染;
- `c.XML(code, obj)`: XML 渲染;
- `c.Render(code, r render.Render)`: 自定义渲染;

## HTML 模板

- `h.LoadHTMLGlob("render/html/*")` / `LoadHTMLFiles(...)`: 加载模板;
- `h.Delims("{[{", "}]}")`: 自定义分隔符;
- `h.SetFuncMap(template.FuncMap)`: 注册模板函数;

## 自定义渲染

- 实现 `render.Render` 接口（`Render` 与 `WriteContentType`）;
- 通过 `c.Render(code, r)` 使用;

## JSON 库

- 默认使用 [sonic](https://github.com/bytedance/sonic)，需 Go 1.17+、amd64/arm64;
- 条件不满足时自动 fallback 到 `encoding/json`;
- `render.ResetJSONMarshal(json.Marshal)`: 替换序列化库;
- `bindConfig.UseStdJSONUnmarshaler()`: 替换反序列化库;
- `go build -tags stdjson`: 条件编译强制使用标准库;

## 常量

- `pkg/protocol/consts` 提供 HTTP 方法、状态码、MIME、Header 名等常量;
- 示例: `consts.StatusOK`、`consts.MethodGet`、`consts.MIMEApplicationJSON`;
