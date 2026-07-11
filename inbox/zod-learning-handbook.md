---
id: DEFAB2D7-F24C-4875-B0C4-24EF96731C40
---

# Zod 初学者学习手册

## 定位

- Zod: TypeScript-first runtime validation library, 用 schema 同时描述运行时校验规则和静态类型;
- 核心用途: 保护 trust boundary, 如 request body、route params、env、form values、external API response、persisted JSON;
- 非目标: 不替代 TypeScript 类型系统, 不需要给所有内部已可信对象重复校验;
- 基础环境: Zod 4 stable, 官方测试 TypeScript v5.5+, 项目应开启 `strict`;
- 包选择: 默认用 `zod`, 极端前端 bundle 约束再考虑 `zod/mini`, library author 才关注 `zod/v4/core`;

## 最小学习路径

- Step 1: 先理解 `schema.parse(unknown): Output`, Zod 接收未知输入并返回已校验的 output;
- Step 2: 学会 `safeParse`, 把校验失败当作普通分支处理;
- Step 3: 用 `z.object`, `z.array`, `z.union`, `z.discriminatedUnion` 表达常见数据结构;
- Step 4: 用 `z.infer`, `z.input`, `z.output` 防止 schema 与 TS type 漂移;
- Step 5: 用 `refine/superRefine` 表达跨字段或业务校验;
- Step 6: 用 `transform/pipe` 处理单向转换, 需要双向转换时再学 codecs;
- Step 7: 只在需要导出契约时碰 JSON Schema, 不把它当成完整 Zod 替身;

## 心智模型

### Runtime Boundary

- TypeScript type: compile-time only, 运行时不存在;
- Zod schema: runtime value, 运行时可检查未知输入;
- `parse`: 校验并返回 strongly typed deep clone, 失败抛 `ZodError`;
- `safeParse`: 返回 discriminated union, 适合表单、接口入口、局部错误处理;
- Async schema: 只要 refinement/transform/codec 中有 async, 就用 `parseAsync/safeParseAsync`;

```typescript
import * as z from "zod";

const UserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  age: z.number().int().min(0),
});

type User = z.infer<typeof UserSchema>;

const result = UserSchema.safeParse(input);
if (!result.success) {
  result.error.issues; // structured issues
} else {
  const user: User = result.data;
}
```

### Schema First

- Schema 命名: 用 `UserSchema` 表示运行时 schema, 用 `User` 表示推导类型;
- `z.infer<typeof S>`: 等价于 `z.output<typeof S>`, 适合无 transform 的普通 schema;
- `z.input<typeof S>`: schema 接收的输入类型, transform/coerce/preprocess/codecs 时尤其重要;
- `z.output<typeof S>`: schema parse 后的输出类型, 也是业务代码应依赖的安全形态;

```typescript
const LengthSchema = z.string().transform((value) => value.length);

type LengthInput = z.input<typeof LengthSchema>; // string
type LengthOutput = z.output<typeof LengthSchema>; // number
```

## 常用 Schema

### Primitive

- `z.string()`: 字符串;
- `z.number()`: number, 可继续 `.int()`, `.min()`, `.max()`;
- `z.boolean()`: boolean;
- `z.literal(value)`: 单个 literal, Zod 4 也支持多个 literal values;
- `z.enum([...])`: 字符串枚举值;
- `z.optional(S) / S.optional()`: 允许 `undefined`;
- `z.nullable(S) / S.nullable()`: 允许 `null`;
- `z.nullish(S)`: 同时允许 `null | undefined`;
- `z.coerce.*`: 使用 JS constructor 做 coercion, 默认 input type 是 `unknown`;

```typescript
const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535),
  DEBUG: z.stringbool().default(false),
});

EnvSchema.parse({ PORT: "3000", DEBUG: "true" });
```

### Object

- `z.object({...})`: 字段默认 required, unknown keys 默认 strip;
- `z.strictObject({...})`: unknown keys 触发错误;
- `z.looseObject({...})`: unknown keys 保留在输出;
- `.catchall(S)`: unknown keys 必须满足指定 schema;
- `.pick/.omit/.partial/.required`: 与 TypeScript utility types 对齐;
- `.extend()`: 可覆盖同名字段, 大 schema 或需要显式 strictness 时优先 spread 新 object;
- `.safeExtend()`: 保证扩展后类型仍 extends 原 schema, 含 refinements 的 object 推荐使用;

```typescript
const BaseUserSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
});

const PublicUserSchema = z.strictObject({
  ...BaseUserSchema.shape,
  avatarUrl: z.url().optional(),
});
```

### Array And Union

- `z.array(S)`: 元素均需满足 S, 可 `.min/.max/.length`;
- `z.tuple([...])`: 固定长度且每个位置类型不同;
- `z.union([A, B])`: 按顺序尝试, 第一个通过的 option 成为结果;
- `z.discriminatedUnion(key, options)`: 用 discriminator key 快速分支, 大 union 更清晰高效;
- `z.xor([A, B])`: 要求正好一个 option 匹配;

```typescript
const SuccessSchema = z.object({
  status: z.literal("success"),
  data: z.array(z.string()).min(1),
});

const FailedSchema = z.object({
  status: z.literal("failed"),
  error: z.string(),
});

const ResultSchema = z.discriminatedUnion("status", [SuccessSchema, FailedSchema]);
```

## Parse And Errors

### Parse Strategy

| API              | 成功                      | 失败                        | 场景                     |
| ---------------- | ------------------------- | --------------------------- | ------------------------ |
| `parse`          | 返回 data                 | throw `ZodError`            | 中央错误处理、启动期配置 |
| `safeParse`      | `{ success: true, data }` | `{ success: false, error }` | 表单、接口入口、局部分支 |
| `parseAsync`     | Promise data              | reject/throw                | async refine/transform   |
| `safeParseAsync` | Promise result            | Promise result              | async 且需局部分支       |

```typescript
const parsed = LoginSchema.safeParse(body);
if (!parsed.success) {
  const fields = z.flattenError(parsed.error).fieldErrors;
  return { ok: false, fields };
}

return { ok: true, data: parsed.data };
```

### Error Shape

- `ZodError.issues`: issue array, 每个 issue 至少包含 `code`, `path`, `message`;
- `error` param: Zod 4 统一错误定制入口, 可传 string 或 function;
- Error precedence: schema-level `error` > per-parse `error` > global `z.config()` > locale;
- `reportInput`: 默认不把 input 写入 issue, 避免敏感数据进入日志;

```typescript
const PasswordSchema = z.string().min(8, {
  error: (issue) => `Password must have at least ${issue.minimum} chars`,
});

PasswordSchema.safeParse("short", {
  error: (issue) => `fallback message for ${issue.code}`,
});
```

### Error Formatting

- `z.flattenError(error)`: flat object, 适合一层 form fields;
- `z.treeifyError(error)`: nested tree, 适合嵌套 object/array;
- `z.prettifyError(error)`: human-readable string, 适合日志或 CLI;
- `z.formatError(error)`: deprecated, 新代码用 `treeifyError`;

```typescript
const result = UserSchema.safeParse({ email: 1, age: -1 });

if (!result.success) {
  const flat = z.flattenError(result.error);
  flat.fieldErrors.email;

  const tree = z.treeifyError(result.error);
  tree.properties?.email?.errors;
}
```

## Refinement

### refine

- `.refine(predicate)`: 适合单个 custom issue;
- Predicate 规则: 不要 throw, 返回 falsy 表示失败;
- `path`: 把 object-level 校验错误挂到具体字段;
- `abort: true`: 当前 refinement 失败后停止后续 checks;
- `when`: power-user feature, 控制 refinement 何时运行, 初学阶段少用;

```typescript
const RegisterSchema = z
  .object({
    password: z.string().min(8),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    error: "Passwords do not match",
    path: ["confirm"],
  });
```

### superRefine

- `.superRefine((value, ctx) => ...)`: 可添加多个 issue;
- `ctx.addIssue`: 可使用 Zod 内部 issue code, 比 `refine` 更适合复杂集合校验;
- 性能敏感低层场景才考虑 `.check()`, 普通业务优先 `refine/superRefine`;

```typescript
const TagsSchema = z.array(z.string()).superRefine((tags, ctx) => {
  if (tags.length > 5) {
    ctx.addIssue({
      code: "too_big",
      maximum: 5,
      origin: "array",
      inclusive: true,
      message: "Too many tags",
      input: tags,
    });
  }

  if (new Set(tags).size !== tags.length) {
    ctx.addIssue({
      code: "custom",
      message: "Duplicate tags are not allowed",
      input: tags,
    });
  }
});
```

## Transform And Pipe

### Unidirectional Transform

- `z.transform(fn)`: 接收任意输入并输出新值, 不负责先验类型校验;
- `S.transform(fn)`: 等价于先 parse S, 再 transform;
- `S.pipe(T)`: 把一个 schema 的 output 交给下一个 schema;
- Transform 规则: 不要 throw, 需要报告问题时写 `ctx.issues` 并返回 `z.NEVER`;
- Async transform: 必须用 `parseAsync/safeParseAsync`;

```typescript
const StringToIntSchema = z
  .string()
  .regex(/^-?\d+$/)
  .transform((value) => Number.parseInt(value, 10))
  .pipe(z.int());

type StringToIntInput = z.input<typeof StringToIntSchema>; // string
type StringToIntOutput = z.output<typeof StringToIntSchema>; // number
```

### Defaults

- `.default(value)`: input 为 `undefined` 时短路返回 default, default 必须符合 output type;
- `.prefault(value)`: input 为 `undefined` 时把 value 当 input 继续 parse;
- `.catch(value)`: validation error 时返回 fallback, 适合非关键默认值;

```typescript
const A = z.string().trim().toUpperCase().default("  tuna  ");
const B = z.string().trim().toUpperCase().prefault("  tuna  ");

A.parse(undefined); // "  tuna  "
B.parse(undefined); // "TUNA"
```

## Codecs And JSON Schema

### Codecs

- `z.codec(inputSchema, outputSchema, { decode, encode })`: 双向转换, Zod 4.1 引入;
- `parse/decode`: forward, 从 Input 到 Output;
- `encode`: backward, 从 Output 回到 Input;
- `parse`: input type 是 `unknown`, 运行时失败;
- `z.decode/z.encode`: input 是强类型, 可在编译期发现方向错误;
- Transform 边界: `.transform()` 是单向转换, 含 transform 的 schema 不能安全 `encode`;

```typescript
const IsoDateCodec = z.codec(z.iso.datetime(), z.date(), {
  decode: (value) => new Date(value),
  encode: (value) => value.toISOString(),
});

const date = z.decode(IsoDateCodec, "2024-01-15T10:30:00.000Z");
const iso = z.encode(IsoDateCodec, date);
```

### JSON Schema

- `z.toJSONSchema(schema)`: Zod 4 原生导出 JSON Schema, 默认描述 output type;
- `{ io: "input" }`: 导出 input type, transform/coerce/pipe 时很重要;
- `z.fromJSONSchema(json)`: experimental, 不视为稳定 API;
- Unrepresentable: `bigint`, `int64`, `symbol`, `undefined`, `void`, `date`, `map`, `set`, `transform`, `nan`, `custom` 默认无法表示并抛错;
- Object conversion: `z.object()` output mode 默认 `additionalProperties: false`, 对应 unknown keys 被 strip;

```typescript
const PayloadSchema = z.object({
  name: z.string(),
  age: z.number(),
});

const jsonSchema = z.toJSONSchema(PayloadSchema);
```

```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "age": { "type": "number" }
  },
  "required": ["name", "age"],
  "additionalProperties": false
}
```

## Zod Mini

| Package       | 适合场景                   | API 风格                | 默认建议   |
| ------------- | -------------------------- | ----------------------- | ---------- |
| `zod`         | 大多数 app/backend/tooling | chainable methods       | 默认选择   |
| `zod/mini`    | 极端 bundle size 约束      | functional + `.check()` | 谨慎选择   |
| `zod/v4/core` | schema library authors     | low-level substrate     | 初学者不用 |

- Zod Mini 功能与 `zod` 对齐, 但为了 tree-shaking 使用更多 top-level functions;
- Zod Mini DX 较弱, autocomplete 和链式组合不如 regular Zod;
- Zod Mini 不默认加载 English locale, issue message 默认可能只是 `Invalid input`;

```typescript
import * as z from "zod/mini";

const NameSchema = z.string().check(z.minLength(1), z.maxLength(40), z.trim());
```

## 常见误区

- 误区: 已写 TypeScript type 就有运行时校验; 修正: 边界输入仍是 `unknown`, 必须 parse;
- 误区: `z.object()` 默认 strict; 修正: 默认 strip unknown keys, strict 要用 `z.strictObject`;
- 误区: 表单错误用 `parse` 再 catch; 修正: 正常失败分支优先 `safeParse`;
- 误区: async refinement 后继续用 `parse`; 修正: async 任一环节出现就用 async parse API;
- 误区: transform 后还用 `z.infer` 当输入类型; 修正: input 用 `z.input`, output 用 `z.output`;
- 误区: `z.coerce.boolean()` 能把 `"false"` 变 `false`; 修正: JS `Boolean("false")` 是 `true`, env boolean 用 `z.stringbool`;
- 误区: 在 `refine/transform` 里 throw; 修正: Zod 不捕获这些 throw, 用 falsy 或 `ctx.issues`;
- 误区: 任意 Zod schema 都能导 JSON Schema; 修正: transform/date/map/set 等存在不可表示边界;
- 误区: 开启 `reportInput` 方便排错; 修正: 可能把密码、token、PII 写进日志;
- 误区: 到处用 Zod 包裹内部函数参数; 修正: 优先校验 trust boundary, 内部逻辑靠 TS type 和测试;

## 最小模板

```typescript
import * as z from "zod";

export const CreateUserInputSchema = z.strictObject({
  email: z.email({ error: "Invalid email" }),
  name: z.string().min(1).max(80),
  role: z.enum(["admin", "member"]).default("member"),
});

export type CreateUserInput = z.input<typeof CreateUserInputSchema>;
export type CreateUser = z.output<typeof CreateUserInputSchema>;

export const parseCreateUser = (input: unknown) => {
  const result = CreateUserInputSchema.safeParse(input);

  if (!result.success) {
    return {
      ok: false as const,
      errors: z.flattenError(result.error).fieldErrors,
    };
  }

  return {
    ok: true as const,
    data: result.data,
  };
};
```

## Source Snapshot

- 来源: 本地 Zod 官方 docs snapshot, `references/source-docs`;
- 快照日期: 2026-05-31;
- 已读文件: `index.mdx`, `basics.mdx`, `api.mdx`, `error-customization.mdx`, `error-formatting.mdx`, `codecs.mdx`, `json-schema.mdx`, `packages/mini.mdx`, `v4/index.mdx`;
