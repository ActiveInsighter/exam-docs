/*
 * A small, safe parser for the maths readers type into blanks.
 *
 * Supported (see docs/question-components.md for the reader-facing list):
 *   numbers 3, 0.5, .5, 1e-3 · constants π / pi, e · single-letter variables
 *   + − × · ÷ / ^ (right-assoc) and implicit products (2x, 3(x+1), (a)(b), xy)
 *   postfix % and ! · |x| · ² ³ superscripts · √x, ∛x
 *   functions: sqrt cbrt abs sin cos tan cot sec csc arcsin arccos arctan
 *              sinh cosh tanh ln lg log exp, and log(b, x) with an explicit base
 *   one top-level "=" (equations, compared up to a non-zero factor)
 *
 * Nothing is ever executed: the text becomes a typed tree, and evaluate.ts
 * walks that tree with a fixed table of functions.
 */

export type MathFunction =
  | 'sqrt' | 'cbrt' | 'abs'
  | 'sin' | 'cos' | 'tan' | 'cot' | 'sec' | 'csc'
  | 'arcsin' | 'arccos' | 'arctan'
  | 'sinh' | 'cosh' | 'tanh'
  | 'ln' | 'lg' | 'log' | 'exp';

export type MathNode =
  | { type: 'number'; value: number; raw: string }
  | { type: 'constant'; name: 'pi' | 'e' }
  | { type: 'variable'; name: string }
  | { type: 'negate'; arg: MathNode }
  | { type: 'binary'; op: '+' | '-' | '*' | '/' | '^'; left: MathNode; right: MathNode; implicit?: boolean }
  | { type: 'postfix'; op: '%' | '!'; arg: MathNode }
  | { type: 'call'; fn: MathFunction; args: MathNode[]; power?: MathNode }
  | { type: 'group'; arg: MathNode }
  | { type: 'equation'; left: MathNode; right: MathNode };

export type ParseResult =
  | { ok: true; node: MathNode }
  | { ok: false; error: string; /** Character offset in the normalised text, if known. */ at?: number };

export const MATH_INPUT_MAX_LENGTH = 200;
const MAX_NODES = 400;
const MAX_DEPTH = 48;

const FUNCTIONS: readonly MathFunction[] = [
  'arcsin', 'arccos', 'arctan', 'sqrt', 'cbrt', 'sinh', 'cosh', 'tanh',
  'abs', 'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'exp', 'log', 'ln', 'lg',
];
/** Common alternative spellings, mapped before tokenising. */
const FUNCTION_ALIASES: Record<string, MathFunction> = {
  asin: 'arcsin', acos: 'arccos', atan: 'arctan', tg: 'tan', ctg: 'cot', arctg: 'arctan',
};

type Token =
  | { kind: 'number'; value: number; raw: string; at: number }
  | { kind: 'name'; value: string; at: number }
  | { kind: 'fn'; value: MathFunction; at: number }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' | '^' | '%' | '!' | '=' | ',' | '(' | ')' | '|'; at: number };

/**
 * Folds the many ways a formula can be typed (full-width digits, × ÷ −,
 * superscripts, Chinese brackets) into the ASCII the tokenizer reads.
 */
export function normalizeMathText(text: string): string {
  return text
    // Before NFKC, which would fold x² into a plain x2.
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/gu, (digits) => `^(${[...digits].map((digit) => '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(digit)).join('')})`)
    .normalize('NFKC')
    .replace(/[×✕✖⋅·∙]/gu, '*')
    .replace(/÷/gu, '/')
    .replace(/[−–—﹣－]/gu, '-')
    .replace(/[（]/gu, '(')
    .replace(/[）]/gu, ')')
    .replace(/[，]/gu, ',')
    .replace(/π|Π/gu, 'pi')
    .replace(/√/gu, 'sqrt')
    .replace(/∛/gu, 'cbrt')
    .replace(/\*\*/gu, '^')
    .replace(/\s+/gu, ' ')
    .trim();
}

function tokenize(text: string): Token[] | { error: string; at: number } {
  const tokens: Token[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === ' ') { index++; continue; }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/iu.exec(text.slice(index));
    // "2e" is 2·e, not an unfinished exponent: only take e when digits follow.
    if (number) {
      const raw = number[0];
      tokens.push({ kind: 'number', value: Number(raw), raw, at: index });
      index += raw.length;
      continue;
    }
    if (/[a-z]/iu.test(char)) {
      const word = /^[a-z]+/iu.exec(text.slice(index))![0];
      tokens.push(...splitWord(word, index));
      index += word.length;
      continue;
    }
    if ('+-*/^%!=,()|'.includes(char)) {
      tokens.push({ kind: 'op', value: char as Extract<Token, { kind: 'op' }>['value'], at: index });
      index++;
      continue;
    }
    if (char === '[' || char === '{') { tokens.push({ kind: 'op', value: '(', at: index }); index++; continue; }
    if (char === ']' || char === '}') { tokens.push({ kind: 'op', value: ')', at: index }); index++; continue; }
    return { error: `无法识别的字符「${char}」`, at: index };
  }
  return tokens;
}

/** "sinx" → sin x, "xy" → x y, "pi" → π, "arcsinx" → arcsin x. */
function splitWord(word: string, at: number): Token[] {
  const tokens: Token[] = [];
  let rest = word;
  let offset = at;
  while (rest) {
    const lower = rest.toLowerCase();
    const alias = Object.keys(FUNCTION_ALIASES).find((name) => lower.startsWith(name));
    const fn = alias ? FUNCTION_ALIASES[alias] : FUNCTIONS.find((name) => lower.startsWith(name));
    const length = alias?.length ?? fn?.length ?? 0;
    if (fn) {
      tokens.push({ kind: 'fn', value: fn, at: offset });
    } else if (lower.startsWith('pi')) {
      tokens.push({ kind: 'name', value: 'pi', at: offset });
      rest = rest.slice(2); offset += 2;
      continue;
    } else {
      tokens.push({ kind: 'name', value: rest[0], at: offset });
      rest = rest.slice(1); offset += 1;
      continue;
    }
    rest = rest.slice(length);
    offset += length;
  }
  return tokens;
}

class Parser {
  private position = 0;
  private nodes = 0;
  private depth = 0;
  private absDepth = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined { return this.tokens[this.position]; }

  private isOp(value: string, token = this.peek()): boolean {
    return token?.kind === 'op' && token.value === value;
  }

  private fail(message: string, token = this.peek()): never {
    throw new MathSyntaxError(message, token?.at);
  }

  private node<T extends MathNode>(value: T): T {
    if (++this.nodes > MAX_NODES) this.fail('表达式过长');
    return value;
  }

  private nested<T>(run: () => T): T {
    if (++this.depth > MAX_DEPTH) this.fail('括号或运算嵌套过深');
    try { return run(); } finally { this.depth--; }
  }

  parse(): MathNode {
    if (!this.tokens.length) this.fail('请输入表达式');
    const left = this.expression();
    let result = left;
    if (this.isOp('=')) {
      this.position++;
      const right = this.expression();
      result = this.node({ type: 'equation', left, right });
    }
    if (this.position < this.tokens.length) {
      const token = this.peek()!;
      this.fail(token.kind === 'op' && token.value === ')' ? '多余的右括号' : '表达式不完整或多余的符号', token);
    }
    return result;
  }

  private expression(): MathNode {
    return this.nested(() => {
      let left = this.term();
      while (this.isOp('+') || this.isOp('-')) {
        const op = (this.tokens[this.position++] as { value: '+' | '-' }).value;
        left = this.node({ type: 'binary', op, left, right: this.term() });
      }
      return left;
    });
  }

  /** Starts an implicit product: a number, name, function, "(" or an opening "|". */
  private startsFactor(token = this.peek()): boolean {
    if (!token) return false;
    if (token.kind !== 'op') return true;
    if (token.value === '(') return true;
    return token.value === '|' && this.absDepth === 0;
  }

  private term(): MathNode {
    let left = this.unary();
    for (;;) {
      if (this.isOp('*') || this.isOp('/')) {
        const op = (this.tokens[this.position++] as { value: '*' | '/' }).value;
        left = this.node({ type: 'binary', op, left, right: this.unary() });
      } else if (this.startsFactor()) {
        left = this.node({ type: 'binary', op: '*', left, right: this.power(), implicit: true });
      } else {
        return left;
      }
    }
  }

  private unary(): MathNode {
    if (this.isOp('-')) {
      this.position++;
      return this.node({ type: 'negate', arg: this.nested(() => this.unary()) });
    }
    if (this.isOp('+')) {
      this.position++;
      return this.nested(() => this.unary());
    }
    return this.power();
  }

  private power(): MathNode {
    const base = this.postfix();
    if (!this.isOp('^')) return base;
    this.position++;
    // Right-associative, and the exponent may carry its own sign: 2^-1.
    const exponent = this.nested(() => this.unary());
    return this.node({ type: 'binary', op: '^', left: base, right: exponent });
  }

  private postfix(): MathNode {
    let node = this.primary();
    while (this.isOp('%') || this.isOp('!')) {
      const op = (this.tokens[this.position++] as { value: '%' | '!' }).value;
      node = this.node({ type: 'postfix', op, arg: node });
    }
    return node;
  }

  private primary(): MathNode {
    const token = this.peek();
    if (!token) this.fail('表达式不完整');
    if (token.kind === 'number') {
      this.position++;
      if (!Number.isFinite(token.value)) this.fail('数字超出范围', token);
      return this.node({ type: 'number', value: token.value, raw: token.raw });
    }
    if (token.kind === 'name') {
      this.position++;
      if (token.value === 'pi') return this.node({ type: 'constant', name: 'pi' });
      if (token.value === 'e') return this.node({ type: 'constant', name: 'e' });
      return this.node({ type: 'variable', name: token.value });
    }
    if (token.kind === 'fn') return this.call(token.value);
    if (token.value === '(') {
      this.position++;
      const inner = this.absolute(false, () => this.expression());
      if (!this.isOp(')')) this.fail('缺少右括号');
      this.position++;
      return this.node({ type: 'group', arg: inner });
    }
    if (token.value === '|' && this.absDepth === 0) {
      this.position++;
      const inner = this.absolute(true, () => this.expression());
      if (!this.isOp('|')) this.fail('绝对值缺少右侧的 |');
      this.position++;
      return this.node({ type: 'call', fn: 'abs', args: [inner] });
    }
    if (token.value === '|') {
      // Nested |…| inside another absolute value, e.g. ||x|-1|.
      this.position++;
      const saved = this.absDepth;
      this.absDepth = 0;
      const inner = this.absolute(true, () => this.expression());
      this.absDepth = saved;
      if (!this.isOp('|')) this.fail('绝对值缺少右侧的 |');
      this.position++;
      return this.node({ type: 'call', fn: 'abs', args: [inner] });
    }
    return this.fail(token.value === ')' ? '多余的右括号' : `「${token.value}」前缺少数字或表达式`, token);
  }

  /** Parentheses reset the |…| context; an absolute value opens one. */
  private absolute<T>(opening: boolean, run: () => T): T {
    const saved = this.absDepth;
    this.absDepth = opening ? saved + 1 : 0;
    try { return run(); } finally { this.absDepth = saved; }
  }

  private call(fn: MathFunction): MathNode {
    this.position++;
    // sin^2 x: the power applies to the result.
    let power: MathNode | undefined;
    if (this.isOp('^')) {
      this.position++;
      power = this.nested(() => this.unary());
    }
    let args: MathNode[];
    if (this.isOp('(')) {
      this.position++;
      args = this.absolute(false, () => {
        const list = [this.expression()];
        while (this.isOp(',')) {
          this.position++;
          list.push(this.expression());
        }
        return list;
      });
      if (!this.isOp(')')) this.fail(`${fn} 缺少右括号`);
      this.position++;
    } else {
      if (!this.peek() || !this.startsFactor()) this.fail(`${fn} 后面缺少参数`);
      args = [this.nested(() => this.power())];
    }
    const arity = fn === 'log' ? [1, 2] : [1];
    if (!arity.includes(args.length)) this.fail(fn === 'log' ? 'log 最多两个参数：log(底数, 真数)' : `${fn} 只接受一个参数`);
    return this.node({ type: 'call', fn, args, ...(power ? { power } : {}) });
  }
}

export class MathSyntaxError extends Error {
  constructor(message: string, readonly at?: number) {
    super(message);
    this.name = 'MathSyntaxError';
  }
}

export function parseMath(text: string): ParseResult {
  if (text.length > MATH_INPUT_MAX_LENGTH) return { ok: false, error: `表达式不能超过 ${MATH_INPUT_MAX_LENGTH} 个字符` };
  const normalized = normalizeMathText(text);
  const tokens = tokenize(normalized);
  if (!Array.isArray(tokens)) return { ok: false, error: tokens.error, at: tokens.at };
  try {
    return { ok: true, node: new Parser(tokens).parse() };
  } catch (error) {
    if (error instanceof MathSyntaxError) return { ok: false, error: error.message, at: error.at };
    throw error;
  }
}

/** Free variables of a tree, sorted. */
export function mathVariables(node: MathNode, into = new Set<string>()): Set<string> {
  switch (node.type) {
    case 'variable': into.add(node.name); break;
    case 'negate': case 'postfix': case 'group': mathVariables(node.arg, into); break;
    case 'binary': case 'equation': mathVariables(node.left, into); mathVariables(node.right, into); break;
    case 'call':
      for (const arg of node.args) mathVariables(arg, into);
      if (node.power) mathVariables(node.power, into);
      break;
    default: break;
  }
  return into;
}
