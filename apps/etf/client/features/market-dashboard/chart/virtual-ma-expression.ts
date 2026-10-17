export interface VirtualMaExpression {
  readonly referencedPeriods: readonly number[];
  readonly evaluate: (getMaValue: (period: number) => number | null) => number | null;
}

type BinaryOperator = "+" | "-" | "*" | "/";

type Token =
  | { kind: "number"; value: number }
  | { kind: "ma"; period: number }
  | { kind: "operator"; value: BinaryOperator }
  | { kind: "paren"; value: "(" | ")" };

type AstNode =
  | { kind: "number"; value: number }
  | { kind: "ma"; period: number }
  | { kind: "binary"; operator: BinaryOperator; left: AstNode; right: AstNode };

const tokenize = (text: string): Token[] | null => {
  const tokens: Token[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index] as string;
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    const numberMatch = /^\d+(?:\.\d+)?/.exec(text.slice(index));
    if (numberMatch) {
      tokens.push({ kind: "number", value: Number(numberMatch[0]) });
      index += numberMatch[0].length;
      continue;
    }
    const maMatch = /^ma(\d+)/i.exec(text.slice(index));
    if (maMatch) {
      tokens.push({ kind: "ma", period: Number(maMatch[1]) });
      index += maMatch[0].length;
      continue;
    }
    if ("+-*/".includes(char)) {
      tokens.push({ kind: "operator", value: char as BinaryOperator });
      index += 1;
      continue;
    }
    if (char === "(" || char === ")") {
      tokens.push({ kind: "paren", value: char });
      index += 1;
      continue;
    }
    return null;
  }
  return tokens;
};

interface Parser {
  position: number;
  tokens: Token[];
}

const peekToken = (parser: Parser): Token | undefined => parser.tokens[parser.position];

const parseFactor = (parser: Parser): AstNode | null => {
  const token = peekToken(parser);
  if (token?.kind === "number" || token?.kind === "ma") {
    parser.position += 1;
    return token;
  }
  if (token?.kind === "paren" && token.value === "(") {
    parser.position += 1;
    const inner = parseAddSub(parser);
    const closing = peekToken(parser);
    if (inner === null || closing?.kind !== "paren" || closing.value !== ")") return null;
    parser.position += 1;
    return inner;
  }
  return null;
};

const parseMulDiv = (parser: Parser): AstNode | null => {
  let left = parseFactor(parser);
  if (left === null) return null;
  let token = peekToken(parser);
  while (token?.kind === "operator" && (token.value === "*" || token.value === "/")) {
    parser.position += 1;
    const right = parseFactor(parser);
    if (right === null) return null;
    left = { kind: "binary", operator: token.value, left, right };
    token = peekToken(parser);
  }
  return left;
};

const parseAddSub = (parser: Parser): AstNode | null => {
  let left = parseMulDiv(parser);
  if (left === null) return null;
  let token = peekToken(parser);
  while (token?.kind === "operator" && (token.value === "+" || token.value === "-")) {
    parser.position += 1;
    const right = parseMulDiv(parser);
    if (right === null) return null;
    left = { kind: "binary", operator: token.value, left, right };
    token = peekToken(parser);
  }
  return left;
};

const collectPeriods = (node: AstNode, periods: number[]): void => {
  if (node.kind === "ma") {
    if (!periods.includes(node.period)) periods.push(node.period);
    return;
  }
  if (node.kind === "binary") {
    collectPeriods(node.left, periods);
    collectPeriods(node.right, periods);
  }
};

// null 沿 AST 向上传播：引用的 MA 无值或除零时，该点结果即为 null。
const evaluateNode = (
  node: AstNode,
  getMaValue: (period: number) => number | null,
): number | null => {
  if (node.kind === "number") return node.value;
  if (node.kind === "ma") return getMaValue(node.period);
  const left = evaluateNode(node.left, getMaValue);
  const right = evaluateNode(node.right, getMaValue);
  if (left === null || right === null) return null;
  switch (node.operator) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return right === 0 ? null : left / right;
  }
};

export const parseVirtualMaExpression = (text: string): VirtualMaExpression | null => {
  const tokens = tokenize(text);
  if (tokens === null || tokens.length === 0) return null;
  const parser: Parser = { position: 0, tokens };
  const ast = parseAddSub(parser);
  if (ast === null || parser.position !== tokens.length) return null;

  const referencedPeriods: number[] = [];
  collectPeriods(ast, referencedPeriods);
  return {
    referencedPeriods,
    evaluate: (getMaValue: (period: number) => number | null): number | null =>
      evaluateNode(ast, getMaValue),
  };
};
