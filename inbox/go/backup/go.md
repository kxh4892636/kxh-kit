# go 开发环境

## 安装

### 安装

- [安装 go](https://go.dev/doc/install)

### 验证

- 终端输入命令;

```bash
go version # 预期显示 go version go1.20.14 darwin/arm64
```

## 配置

### 命令

```bash
go help environment
```

### 常用配置

| 环境变量    | 作用                                                        |
| ----------- | ----------------------------------------------------------- |
| GOARCH      | 指示 Go 编译器生成代码所针对的 CPU 架构                     |
| GOOS        | 指示 Go 编译器生成代码所针对的操作系统                      |
| GO111MODULE | 决定构建模式是传统的 GOPATH 模式还是新引入的 Go module 模式 |
| GOCACHE     | 存储构建结果缓存的路径，这些缓存可能会被后续构建重用        |
| GOMODCACHE  | 存放 Go module 的路径                                       |
| GOPROXY     | 配置 Go module proxy 服务，以加速依赖获取                   |
| GOPATH      | 在传统 GOPATH 模式下，指示 Go 包搜索路径                    |
| GOROOT      | 指示 Go 的安装路径                                          |

## 编辑

- 将 GO 源码转换为可执行文件;
- 可执行文件可在无 GO

### 编辑命令

```bash
go build main.go
```

# 模块

## 构建 go module

### 依赖命令

```bash
go mod init module-name # 初始化模块
go get path/to/package@latest # 手动添加/更新依赖
go get path/to/package@none # 删除依赖
go mod tidy # GO 程序自动分析代码, 更新依赖
```

### 锁定/替换依赖

- go.mod 中的 replace 指令, 用于替换依赖;
- 路径可以为本地路径, 也可以为远程路径;

```
replace path/to/package => path/to/new-package
```

### 版本管理

- X.Y.Z 格式, X 为大版本号 Y 为中版本号 Z 为小版本号;
  - 大版本号: 重大功能变更, 不兼容旧版本;
  - 中版本号: 新增功能, 保持兼容旧版本;
  - 小版本号: 修复 bug, 保持兼容旧版本;

### 项目结构

```
myproject/
├── go.mod              # 模块配置文件
├── go.sum              # 模块锁定文件
├── main.go             # 程序入口
├── config/             # 配置相关
│   └── config.go
├── internal/           # 内部包，不对外暴露
│   ├── handler/        # 处理层
│   │   └── handler.go
│   ├── service/       # 业务逻辑层
│   │   └── service.go
│   └── repository/    # 数据访问层
│       └── repository.go
├── pkg/                # 公共包，可被外部导入
│   └── utils/
│       └── utils.go
└── tests/              # 测试文件
    └── main_test.go
```

## 包

### 定义包

- package moduleName 定义包, moduleName 为包名;
- main 包为 go 可执行文件的入口点;
  - 每个 go 项目都有且只有一个 main 包;
  - main 函数结束时, 程序退出;

```Go
package main

import (
	"fmt"
)

func main() {
	fmt.Println("Hello, World!")
}
```

#### Init 函数

- 包初始化过程调用的函数, 只会调用一次, 不可显式调用;
- 可存在多个 init 函数, 根据代码顺序调用;

```go
package main

import (
	"fmt"
)

func init() {
	fmt.Println("init")
}
```

### 导入/使用包

- `path/to/package` 最后一个分段通常和包名相同, 其并不是包名;
  - importname 可选, 默认为包名(非目录名), 避免相同包名冲突;
  - `.` 表示点导入, 导入包所有导出标识符, 不需要使用前缀;
- 通过 `package.Identifier` 调用包中的函数;

```Go
import {
	"path1/package1",
	importname "path2/package2",
	. "path3/package3"
}

func Test() {
	package1.Foo()
	importname.Bar()
	Baz() // 点导入包所有导出标识符, 不需要使用前缀
}
```

#### 空导入

- 导入包, 但不导出任何标识符;
- 用于调用导入包的 init 函数;

```Go
import _ "path/to/package"
```

### 导出包

#### 可见性

- 使用 pascal-case 命名法的标识符, 对包外可见;
- 使用 camel-case 命名法的标识符, 只对包内可见;

# 变量

## 变量声明

### 变量声明

- var + 变量名 + 类型 = 值;

```go
// 单变量声明
var var1 type1
// 多变量声明
var var1, var2 type1 = value1, value2
// 简写声明, 根据值推导类型
var var1, var2 = value1, value2
// 声明块
var (
	var1 type1
	var2 type2 = value2
)
// 短变量声明
var1, var2 := value1, value2
```

### 未初始化

- 未初始化变量, 值为该类型的零值;

### 零值

- 所有整形: 0;
- 所有浮点型: 0.0;
- 所有字符串: "";
- 所有布尔型: false;
- 指针/接口/切片/通道/字典/函数: nil;
- 复合类型(struct/array...): 组成元素零值的组合;

## 变量作用域

### 作用域范围

- 宇宙作用域 => 包级作用域 => 文件作用域 => 块级作用域;

### 宇宙作用域

- 无法声明, 存储 GO 预定义标识符;

### 包级作用域

- 用于存储包级可见的变量;
- 文件顶部 + var + 首字母大写;

### 文件作用域

- 用于存储文件级可见的变量;
- 文件顶部 + var;

### 块级作用域

- 用于存储块级可见的局部变量;
- var or := ;

## 常量

### 常量

- 编译时确定的值;
- 整个生命周期不可修改;
- 仅限于基本数据类型;

```go
// 常量声明
const (
	const1 = 10
	const2 string = "hello"
)
```

### 无类型常量和隐式转型

- 无类型变量: 根据右值推导类型;
- 隐式转型: 参与表达式求值时, 自动转换为对应类型;

```go
const (
	const1 = 10
	const2 = "hello"
)
```

### 枚举类型

##### 隐式重复前一个非空表达式

- const 自动使用上一个非空表达式作为当前表达式的初始值;

```go
// 以下两者等效
const (
	Enum1 = 1
	Enum2
)
const (
	Enum1 = 1
	Enum2 = 1
)
```

##### iota

- iota 是一个预定义的常量, 表示常量所处位置的偏移值 (从 0 开始);

```go
const (
	Enum1 = 1 << iota // 1 << 0 = 1
	Enum2 // 1 << 1 = 2
	Enum3 = iota // 3 = 3
	Enum4 =  100 // 100
)
```

## 运算符

### 布尔运算符

| 布尔运算符 | 说明   |
| ---------- | ------ |
| &&         | 逻辑与 |
| \|\|       | 逻辑或 |
| !          | 逻辑非 |

# 类型

## 基础

### 内置类型

- 基本类型: bool, intX, uintX, floatX, complexX;
- 复合类型: byte(int8), rune(int32), string, error, array, struct, map;
- 指针类型: pointer;
- 函数类型: function;
- 接口类型: interface;
- 通道类型: channel;

### 零值可用类型

- 零值有意义的类型;

## 基本数据类型

### 布尔类型

- bool
- 只有两个值: true, false;

### 整数类型

##### 整数类型

- 二进制补码;
- intX, uintX;

##### 整数溢出

- 不同类型整形具有不同取值范围;
- 超出范围, 会导致溢出, 根据二进制补码转换为对应值;

##### 整数字面值

```go
// 整数面值
10
// 二进制面值
0b1010
// 八进制面值
0o12
// 十六进制面值
0x1A
// 数字分隔符 _
1_000_000
```

### 浮点数类型

##### 浮点数类型

- IEEE 754 标准;
- floatX;

##### 浮点数字面值

```go
// 浮点数面值 (十进制)
1.0
// 科学计数法 (十进制 or 十六进制)
1.0e-3
0x1.0p-3
// 数字分隔符 _
1_000_000.000_000
```

### 复数类型

```go
// 复数字面值
1.0 + 2.0i
// complex
complex(1.0, 2.0)
```

### 字符串类型

##### 字符串类型

- 不可变数据类型;
- UTF-8 编码;
- 可空的字节(Unicode 码点)序列;

##### rune 类型

- 用于表示 Unicode 码点;
- int32 的别名;

##### 字符字面量

```go
// rune 类型面值 (单引号)
'a'
// Unicode 码点面值 (单引号)
'\141'
'\u4E20'
```

##### 字符串字面量

- 多个字符字面量的连接;

```go
// 字符串面值 (双引号)
"hello"
// 多行字符串面值 (反引号)
`hello
world`
```

##### 字符串的内部存储

- string 类型不直接存储字符串;
  - 指向字符串的指针 + 表示字符串的长度的字段;

##### 字符串迭代

- for 循环可以用于迭代字符串中的每个字节;
- for range 循环可以用于迭代字符串中的每个字符;

##### 字符串比较

- 根据字符编码顺序, 逐字符比较;

## 复合数据类型

### 数组

##### 数组类型

- 固定长度的同构元素构成的连续序列;
- 元素类型可以为任意类型;

##### 数组等价

- 数组长度相同;
- 元素类型相同;

##### 初始化

- 数组初始化时, 所有元素的默认值为该类型的零值;

```go
// 显式初始化数组
var arr = [3]int{1, 2, 3}
// 使用下标初始化特定元素
var arr3 = [...]int{21: 100}
//  ... 自动计算数组长度
var arr2 = [...]int{1, 2, 3}
```

##### 索引

- 从 0 开始;
- 不支持负数索引;

##### 内存存储

- 数组在内存中是连续存储的;
- 每个元素的地址为第一个元素的地址加上元素索引乘以元素大小;

##### 多维数组

- 数组的数组;
- 从左到右依次解析;

图片在 9.1.2 中

### 切片

##### 切片类型

- 动态长度的同构元素序列;
- 元素类型可以为任意类型;

##### 内部实现

- 三元组结构;
  - array: 指向底层数组的指针;
  - len: 当前切片元素数量;
  - cap: 切片的容量;

```go
type slice struct {
	array unsafe.Pointer
	len   int
	cap   int
}
```

##### 创建切片

```go
// 显式初始化
var slice = []int{1, 2, 3}
// make([]type, len, cap)
var slice = make([]int, 3, 5)
// array[start:end:cap]
var slice = arr[1:3]
// slice[start:end:cap]
var slice2 = slice[1:3]
```

##### 动态扩容

- 底层数组容量小于切片当前元素数量时, 切片会自动扩容;
- 创建新数组作为底层数组, 复制旧数组数据, 旧数组垃圾回收;
- 扩容算法:
  - 小切片 (cap < 256): 扩容为当前切片容量的两倍;
  - 大切片: 不知道;

### Map 类型

##### Map 类型

- Key-value 对无序集合;
- Key 必须是可比较的类型;
  - 函数, 切片, Map 不可作为 Key;
- Value 可以是任意类型;

##### 声明 Map

```go
var m map[type1]type2
```

##### 初始化 Map

```go
// 显式初始化 Map
var m = map[type1]type2()
var m = map[type1]type2{
	key1: value1,
	key2: value2,
}
// 语法糖(go 允许省略 key value 的类型)
var m = map[int][]string{
	1: {"a1", "b1"},
	2: {"a2", "b2"},
}
// make(map[type1]type2)
var m = make(map[int][]string)
```

##### 操作 Map

```go
// 插入/更新元素
m[key] = value
// 删除元素
delete(m, key)
// 获取元素
value, ok := m[key]
// 遍历 Map
for key, value := range m {
	// 处理 key, value
}
// 元素数量
len(m)
```

##### 并发安全

- Map 类型不是并发写安全的;
- 需要使用 sync.Map 类型;

## 定义新类型

### 类型定义

##### 类型定义

```go
type T1 int;
type T2 []string
```

##### 底层类型

- 新类型基于某原生类型定义;
- 该原生类型作为新类型的底层类型;

### 类型别名

- 类型别名并未定义新类型, 仅用于给已存在类型起别名;

```go
type T3 = int
```

## 结构体类型

### 定义结构体类型

##### 定义结构体类型

```go
type T1 struct {
	Field1 int
	Field2 string
}
```

##### 命名规则

- 如果结构体首字母大写, 则该字段对包外可见;
- 如果结构体首字母小写, 则该字段对包内可见;
- 字段同理;

##### 空结构体

- 空结构体没有字段, 仅用于占位;
- 不占用内容空间;

```go
type T struct{}
```

##### 嵌套结构体

- 嵌套结构体: 结构体字段为另一个结构体;
- 不允许自我嵌套和循环嵌套;
- 允许自身类型的指针形式嵌套;

```go
type T2 struct {
	Field3 T1
	Field4 string
}
```

##### 嵌入字段

```go
type T2 struct {
	T1
	Field4 string
}
```

### 声明和初始化结构体

##### 零值初始化

- 结构体每个字段初始化为该类型的零值;

```go
var t T1
```

##### 复合字面量初始化

```go
// 顺序赋值
// 字段顺序, 数量必须与结构体定义时的顺序一致
var t = T1{10, "hello"}
// key-value 赋值
// 无视字段顺序和数量
var t = T1{
	Field1: 10,
	Field2: "hello",
}
```

##### 构造函数初始化

```go
func NewT1(field1 int, field2 string) *T {
	// ...
}

var t = NewT1(10, "hello")
```

## 指针类型

### 指针类型

##### 指针类型

- 存储变量的内存地址;
- type 称作 \*type 的基类型;
- 零值为 nil;

```go
var p *type
```

##### 特殊指针类型

- unsafe.Pointer: 无类型指针, 可以指向任意类型的指针;

##### 取地址符

- & 取地址符, 用于获取变量的地址;
- &var 的类型与 type 保持一直;

```go
var p *type = &var
```

##### 解引用符

- - 解引用符, 用于获取指针指向的变量值;
- \*p 的类型与 type 保持一直;

```go
(*p) = value
```

##### uintptr

- 内置标识符;
- 表示可以容纳任意类型指针的比特模式;

##### 多级指针

- 指向指针的指针;

```go
var a = 10
var p *int = &a
var pp **int = &p
**pp = 20
```

### 指针限制

- 限制显式类型转换;
- 不支持指针运算;
- 可使用 unsafe.Pointer 类型进行上述操作;

```go
var p2 *type1 = (*type1)(unsafe.Pointer(&p1))
p3 = (*int)(unsafe.Pointer(&p2)) + unsafe.Sizeof(*p2)
```

## 接口类型

### 定义接口类型

##### 接口类型

- 方法名具名且唯一;

```go
type I interface {
	Method1()
	Method2()
}
```

##### 类型断言

- 如果 T 实现了 i, ok 返回 true, v 赋值 T;
- 否则, ok 返回 false, v 赋值 T 的零值;

```go
v, ok := i.(T)
```

##### 空接口类型

- 空接口类型: interface{}
- any 是空接口类型的别名;
- 任何类型都实现了空接口类型;

##### 空接口的类型安全问题

- 任何类型都实现了空接口;
- 如果空接口作为函数参数, go 无法对齐进行类型安全检验;
  - 是 go 提出泛型之前的替代方案;

### 接口的实现

##### 动态特性和静态特性

- 静态特性: 接口具有静态类型, 编译阶段检查赋值操作的右值;
- 动态特性: 接口类型变量存储了右值的知识类型信息;

```Go
var err error
err = errors.New("error message")
fmt.Println("%T", err) // *errors.errorString
```

##### 内部表示

- eface 表示空接口, iface 表示非空接口;
- 具有 data 字段指向动态类型变量的值;
- 具有 tab or \_type 存储接口类型变量的信息;

```Go
type iface struct {
	tab *itab
	data unsafe.Pointer
}

type eface struct {
	_type *_type
	data unsafe.Pointer
}
```

# 控制结构

## 条件分支

### if

```go
if condition {
	// 代码块
} else if condition2 {
	// 代码块
} else {
	// 代码块
}
```

### 自用变量

```go
if initSimpleStatement; condition {
	// 代码块
}
```

### switch

##### switch

- InitSimpleStatement 可选;
- CompareOperandList1 可存在多个表达式;

```go
switch InitSimpleStatement; CompareOperand0 {
case CompareOperandList1, CompareOperandList2:
	// do something
case CompareOperandList3:
	// do something
case CompareOperandListN:
	// do something
default:
	// do something
}
```

##### type switch

```go
var x interface{} = 13
switch x.(type) {
case nil:
	// do something
case int:
	// do something
default:
	// do something
}
```

##### fallthrough

- switch 语句继续执行下一个 case 语句;
- fallthrough 必须是 case 语句的最后一条语句;
- fallthrough 不能是最后一个分支;

```go
switch InitSimpleStatement; CompareOperand0 {
case CompareOperandList1:
	// do something
	fallthrough
case CompareOperandList2:
	// do something
default:
	// do something
}
```

## 循环

### for

##### for

- 支持多个循环变量;
- 三部分皆可忽略;

```go
for initSimpleStatement; condition; postSimpleStatement {
	// do something
}
```

### for-range

- 遍历整形, 数组, 切片, 字符串, map, channel;
  - 整形: [0, n-1];
- 每次迭代, 会将元素赋值给循环变量;

```go
for index, value := range collection {
	// do something
}
```

##### 循环变量

- 循环变量在 for 迭代中重用, 存在闭包问题;
- Go 1.22 之后, 循环变量每次迭代创建副本;

## break/continue

### break/continue

- if 语句之外的控制流程;

### 带标签的 break/continue

- 标签必须声明在控制流块之前;
- 会中止/继续标签对应的控制流块, 即使该对应块不是包含 break/continue 的最内层块;

```go
Outer:
	for n++; ; n++{
		for i := 2; ; i++ {
			switch {
			case i * i > n:
				break Outer
			case n % i == 0:
				continue Outer
			}
		}
	}
	return n
```

# 函数

## 函数声明

### 函数声明

```go
func funcName(param1 type1, param2 type2) (return1 type1, return2 type2) {
	// 代码块
}
```

### 函数签名

- 省略函数, 参数和返回值名称;
- 函数签名相同的函数视为相同类型;

```go
func (type1, type2) (type1, type2)
```

### 匿名函数

- 忽略函数名;

```go
f := func(){}
```

### 函数参数

##### 参数传递

- 使用值传递;

##### 变长参数

- 可以传递任意数量的参数;
- 参数类型必须相同;
- 使用切片实现;

```go
func funcName(args ...type) {
	// 代码块
}
```

### 返回值

##### 返回值

- go 支持多返回值, 使用 () 包裹;

##### 具名返回值和匿名返回值

- 具名返回值: 函数签名中指定返回值的名称, 推荐使用;
- 匿名返回值: 函数签名中未指定返回值名称;

```go
func foo() int
func foo() (num int)
```

## defer

### defer

- 延迟调用函数;
- LIFO;
- 存在性能损耗;

### 限制

- defer 语句必须在函数内部使用;
- defer 后接的表达式必须为函数调用;

### 表达式求值时机

- 在 defer 函数注册到 defer 函数栈求值;

## 方法

### 方法声明

- 方法声明必须与 receiverType 在同一个包中;
  - 不能为原生类型添加方法;
- receiverType 不能为 interface 类型和 pointer 类型;
- receiver 参数, 方法参数, 方法返回值, 标识符保持唯一性;

```go
func (receiver receiverType) methodName(param1 type1, param2 type2) (return1 type1, return2 type2) {
	// 代码块
}
```

### 方法与函数

- 方法为函数的语法糖;
- 方法为 receiver 参数作为第一个参数的函数;

```go
func (t *T) Set(value int) {}
func Set(t *T, value int) {}
```

### 方法表达式

- 直接使用 receiverType 类型调用方法;

```go
var t T
t.methodName(param1)
(*T).methodName(t, param1)
```

### 方法集合

- 类型的属性, 表示类型可用的方法;
- 接口类型: 定义方法列表中的所有方法;
- 非接口类型;
  - *T 包含所有已 *T 和 T 为 receiverType 的方法;
  - T 包含所有已 T 为 receiverType 的方法;

### 方法集合与接口实现

- 如果类型 T 的方法集合为接口 I 的方法集合相同, 或者为其超集;
- 认为类型 T 实现了接口 I;

### receiver 类型和选择

- go 使用值传递;
  - T 类型: 传递副本, 不会影响原始值;
  - \*T 类型: 传递指针, 会影响原始值;
- 选择原则: 优先级顺序;
  1. 需要修改原始值, 使用 \*T 类型, 反之使用 T 类型;
  2. 创建副本开销大, 使用 \*T 类型;
  3. T 类型是否需要实现某接口, 需要使用 T 类型, 不需要查看规则 1 - 2;

### 类型嵌入

- go 中组合的实现;
- 嵌入字段的底层类型不能为指针类型;
- 接口类型嵌入: 合并嵌入接口的方法集合;
- 结构体类型嵌入: 合并嵌入结构体的方法集合和字段;

```go
// 接口类型
type I interface {
	Method1()
	Method2()
}
type I2 interface {
	I
	Method3()
}
// 结构体类型
type S struct {
	io.Writer
	*MyStruct
}
```

# 错误处理

## 错误值

### Error 类型

```go
type Error interface {
	Error() string
}
```

### 构造 Error 实例

```go
var err = errors.New("error message")
var err = fmt.Errorf("error message")
```

### 错误链

- 下层错误值包含上层错误值, 形成多层代码传播中的错误结构;

```go
// fmt.Errorf()
var err1 = errors.New("error message")
var err2 = fmt.Errorf("error message: %w", err1)
// error.Join()
var err3 = errors.Join(err1, err2)
```

### 判断错误类型

- 类型断言: 判断 err 是否为指定类型, 无法递归错误链;
- error.As: 可判断 error 是否为指定类型, 可递归错误链;
- error.Is: 可判断错误链是否包含指定错误值;

```go
if err == os.ErrNotExist {
	// do something
}
if errors.As(err, &err1) {
	// do something
}
if errors.Is(err, err1) {
	// do something
}

```

## 异常

### panic/recover

- 函数调用 panic 时, 会触发 panic 处理流程;
- 函数立刻停止执行;
- 函数中的 defer 继续执行;
- panic 会将参数传递给 recover 函数;
  - recover 只能在 defer 函数中调用;
- 若不存在 recover 函数, 则异常沿着调用栈向上传播;
  - 上级函数对下级函数的调用, 替换为对 panic 的调用;

```go
func foo() {
	defer func() {
		if v := recover(); v != nil {
			fmt.Println("recovered:", v)
		}
	}()
	fmt.Println("foo start")
	panic("bye!")
	fmt.Println("foo end")
}
func main() {
	fmt.Println("main start")
	foo()
	fmt.Println("main end")
}
// 输出:
// main start
// foo start
// recovered: bye!
// main end
```

### 如何使用 panic/recover

- 如无必要, 无增实体;
- 只在必要时使用;
  - goroutine 起始处使用 defer 函数注册 recover 函数;
- 定位 bug;
  - 在函数边界使用 panic, 定位 bug 发生的位置, 充当断言的角色;

### 异常和错误的区别

- 异常: 不可预期的错误, 会触发 panic 处理流程;
- 错误: 可预期的错误;

# 并发编程

## goroutine

### 创建 goroutine

- 轻量级线程;
- go 关键字 + 函数/方法;

```go
go fmt.Println("Hello, World!")

go func f() {
	println("Hello, World!")
}
```

### 生命周期

- goroutine 创建后, 独立运行, 由 go 运行时调度器调度;
- goroutine 运行结束, 自动释放资源;

### CSP 模型

- P: process, 任何顺序处理逻辑的封装;
- channel: 用于 P 之间的通信;

## channel

### 创建 channel

- 只能通过 make 函数初始化 channel;

```go
var ch1 = chan int
// 无缓冲 channel
ch2 := make(chan int)
// 有缓冲 channel, 缓冲区大小为 10
ch3 := make(chan int, 10)
```

### 发送和接收

##### 发送和接收

- channel 读写操作一般放置于不同 goroutine 中;

```go
// 发送
ch <- value
// 接收
value := <-ch
```

##### 无缓冲 channel

- 无内部缓冲区, 发送和接收必须同时进行, 放置于两个不同的 goroutine 中;
- 如果只有发送/接收操作且放置于同一 goroutine 中, 对应 goroutine 会阻塞等待, 导致死锁;

##### 有缓冲 channel

- 有内部缓冲区, 发送和接收操作可以异步进行;
- 缓冲区已满时, 发送操作会阻塞等待, 直到缓冲区有空闲位置;
- 缓冲区为空时, 接收操作会阻塞等待, 直到缓冲区有数据;

### 只接收/只发送 channel

- 一般作为函数参数和返回值, 限制 channel 的读写权限;

```go
// 只发送 channel
ch := make(chan<- int)
// 只接收 channel
ch := make(<-chan int)
```

### 通道关闭

- close 函数关闭 channel, 一般在发送方关闭 channel;
- 关闭 channel 后, 发送操作会阻塞等待, 接收操作会返回零值;

```go
close(ch)

n := <-ch // n 赋值该元素类型的零值
m, ok := <-ch // m 赋值该元素类型的零值, ok 赋值 false
for v := range ch { // 无数据可接收, 循环结束
}
```

### select 语句

##### select 语句

- 用于同时执行多个 channel 操作;
- 当所有 channel 都阻塞等待时, select 会阻塞等待, 直至有 channel 可执行;

```go
select {
case ch1 <- value1:
	// do something
case x := <-ch:
	// do something
default:
	// do something
}
```

##### 避免堵塞

- 使用 default 分支避免堵塞;

```go
func trySend(ch chan<- int, value int) {
	select {
	case ch <- value:
		return true
	default:
		return false
	}
}

func tryReceive(ch <-chan int) (int, bool) {
	select {
	case value := <-ch:
		return value, true
	default:
		return 0, false
	}
}
```

##### 超时机制

```go
func worker(ch chan<- int, value int, timeout time.Duration) bool {
	select {
	case ch <- value:
		return true
	case <-time.After(timeout):
		return false
	}
}
```

##### 心跳机制

```go
func worker() {
	heatbeat : = timer.NewTicker(time.Second)
	defer heatbeat.Stop()
	for {
		select {
			case value := <-ch:
					// do something
			case <-heatbeat.C:
				// do something
		}
	}
}
```

# 泛型

## 泛型语法

### 泛型函数

##### 声明泛型函数

- PascalCase 命名;
- 命名唯一;
- 作用域 [] 之间, 无视定义顺序;

```go
func funcName[T1 any, T2 any](param1 T1, param2 T2) (return1 T1, return2 T2) {
	// 代码块
}
```

##### 调用泛型函数

```go
funcName[int, string](1, "hello")
```

##### 自动推导类型参数

- 根据调用函数参数自动推导类型参数;
- 推导类型必须在函数签名中使用;
  - 可显示指定特定函数参数的类型参数;

```go
func foo[T any, E any](param1 int, param2 E) {
	// 代码块
}
foo(1, "hello") // cannot infer T
foo[int](1, "hello") // can infer T as int
```

##### 泛型函数实例化

- go 编译器根据泛型函数声明和函数实参, 生成一个对应类型的新函数;
- 相同类型函数实参多次调用泛型函数, 只会执行一次实例化;

```go
maxGenericsInt := maxGenericics[int] // func([]int) int
```

### 泛型类型

##### 定义泛型类型

- 命名和作用域同泛型函数;

```go
type GenericType[T1 any, T2 any] struct {
	field1 T1[]
	field2 T2
}
```

##### 递归引用

- 泛型类型内部引用该泛型类型;
- 必须带上类型参数, 且顺序与定义顺序一致;

```go
type GenericType[T1 any, T2 any] struct {
	field1 *GenericType[T1, T2]
	field2 T2
}
```

##### 使用泛型类型

```go
var g = GenericType[int, string]{}
```

##### 泛型类型实例化

- 同泛型函数;
- 但不支持自动推导泛型类型参数;

##### 类型别名和类型嵌入

- 只能为实例化后的泛型类型创建别名;
- 泛型类型支持嵌入普通类型和泛型类型, 同样支持被普通类型嵌入;
- 泛型类型不支持嵌入类型参数作为成员;

```go
type GenericTypeIntString = GenericType[int, string]

type Lockable[T any] struct {
	field T
	GenericType[int, string]
	sync.Mutex
}

// embedded field type cannot be a (pointer to a) type parameter
type Lockable[T any] struct {
	T
	sync.Mutex
}
```

### 泛型方法

##### 定义泛型方法

- 泛型方法不支持类型参数;
- receiver 必须使用完整的形参列表, 可使用 \_ 占位符省略;

```go
func (t *Lockable[T]) Lock() {
	t.Mutex.Lock()
}
```

## 类型约束

### 类型约束

- 控制函数实参可使用的类型;
- 通过 interface 定义;

### 内建类型约束

- any: 最宽松的类型约束, 表示任何类型, interface{} 的别名;
- comparable: 可比较的类型约束, 表示可比较的类型, 如 int, float, string 等;

### 自定义类型约束

- 通过 interface 定义和类型嵌入实现;

```go
type ordered interface {
	~int | ~float64
}

type MyConstraint interface {
	Method1()
	comparable
	ordered
}
```

### 类型元素

- 通过| 分隔一组类型, 表示其并集;
- 具有 ~ 表示以该类型为底层类型的类型, 反之代表其自身;
- 不能包含方法的接口类型和预定义约束类型;

### 类型集合

##### 基本接口类型和非基本接口类型

- 基本接口类型: 只包含方法的接口类型;
- 非基本接口类型: 其余类型;

##### 类型集合

- 每个类型都有一个类型集合;
- 非接口类型的类型集合仅为其自身;
- 空接口的类型集合是一个无限集合;
- 非空接口类型的类型集合为其接口元素的类型集合的交集;
- 方法的类型集合为实现了该方法的非接口类型的集合;
- 类型的类型集合为其所有字段的类型集合的并集;

### 简写形式

```go
func foo[T ~int | ~float64](param1 int) {
	// 代码块
}
```
