---
id: d68f0dce-52b2-4b8e-aa10-a754a8f93133
---

# eval 与动态代码

## `eval` 是什么？它能做什么？

- 定义: 内建函数, 把字符串当作代码执行;
- 语法: `let result = eval(code);`
- 返回值: 代码中最后一条语句的结果;
- 字符串内容: 可以很长, 可以含换行、函数声明、变量声明;

```js
eval('alert("Hello")'); // Hello

eval("1 + 1"); // 2
eval("let i = 0; ++i"); // 1, 最后一条语句的值
```

## `eval` 的作用域语义是什么？

- 词法环境: 被执行的代码跑在**调用处的词法环境**里, 不是全局环境;
- 读: 能看到外层变量;
- 写: 能修改外层变量;

```js
let a = 1;
function f() {
  let a = 2;
  eval("alert(a)"); // 2, 取的是 f 里的 a
}
f();

let x = 5;
eval("x = 10");
alert(x); // 10, 外层变量被改掉
```

## 严格模式怎样改变 `eval` 的行为？

| 模式   | 词法环境       | 内部新声明的 `let`/`function` |
| ------ | -------------- | ----------------------------- |
| 非严格 | 复用调用处环境 | 泄漏到外层, 外面可见          |
| 严格   | 自己独立环境   | 外层不可见                    |

```js
// 严格模式
eval("let x = 5; function f() {}");
typeof x; // "undefined", f 同样不可见
```

- 边界: 严格模式只隔离新声明, 不阻止 `eval` 读写已存在的外层变量;

## `new Function` 与普通函数有什么本质区别？

- 语法: `let func = new Function([arg1, arg2, ...argN], functionBody);`
- 输入: 形参名与函数体都是字符串, 运行时才确定, 因此可把外部代码字符串变成函数;
- 关键差异: 它的 `[[Environment]]` 指向**全局词法环境**, 不是创建处的外层环境;

```js
const sum = new Function("a", "b", "return a + b");
sum(1, 2); // 3

const sayHi = new Function('alert("Hello")');
sayHi(); // Hello
```

```js
function getFunc() {
  const value = "test";
  return new Function("alert(value)");
}
getFunc()(); // ReferenceError: value is not defined
```

- 对比: 改成 `return function () { alert(value); }` 就能拿到 `value`, 因为普通函数记住出生时的词法环境, 见 [闭包](../005-函数/040-闭包.md);

| 维度   | `eval(code)`             | `new Function(...)` |
| ------ | ------------------------ | ------------------- |
| 作用域 | 当前词法环境, 可读写外层 | 全局, 只能读全局    |
| 产出   | 最后一条语句的值         | 一个可复用的函数    |
| 取数据 | 隐式捕获外层变量         | 只能显式传参        |
| 污染   | 非严格下新声明会外泄     | 不会                |

- 历史写法: 形参也可写成逗号分隔的字符串, 下面三种等价;

```js
new Function("a", "b", "return a + b");
new Function("a,b", "return a + b");
new Function("a , b", "return a + b");
```

## 什么场景才需要动态执行代码？

- 现代 JS: 几乎没有理由用 `eval`, "eval is evil" 的结论仍然成立;
- 需要动态编译时: 代码字符串来自服务器或模板, 用 `new Function`;
- 需要数据但不想碰外层变量时: 用 `new Function` 把数据当参数显式传入;

```js
const f = new Function("a", "alert(a)");
f(5); // 5
```

- 想彻底避开外层变量: 调用 `window.eval(code)`, 代码在全局作用域执行;

```js
let x = 1;
{
  let x = 5;
  window.eval("alert(x)"); // 1, 全局的 x
}
```

## 用 `eval` / `new Function` 要付出哪些代价？

- 压缩损失: 压缩器不能重命名"可能被 `eval` 看到的局部变量", 代码压缩率下降;
- 可维护性: 外层变量被字符串代码隐式读写, 数据流无法静态追踪;
- 架构: 隐式依赖让函数难以独立测试与复用, 显式传参才是正解;
- 信任边界: 字符串即代码, 来源不可信时等于交出执行权, 必须只执行可信字符串;

## 该用什么替代 `eval`？

- 现代语言构造: 属性访问、映射表、`JSON.parse`、模板字符串覆盖了大多数历史用法;
- 加载代码: 用 ECMAScript 模块 (动态 `import`), 而不是拼字符串执行;
- 共享数据: 换成 `new Function` 并把数据当参数传入;
- 需要固定 `this`: 用 `call`/`apply`/`bind`, 见 [call、apply、bind 与手写实现](../005-函数/070-call-apply-bind与手写实现.md);
