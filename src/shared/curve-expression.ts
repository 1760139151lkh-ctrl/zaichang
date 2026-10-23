/**
 * A small, closed mathematical expression language for the `Curve` primitive.
 * It understands numbers, + − × ÷ ^, parentheses, a fixed set of math
 * functions, the constants pi/π, e and tau, and named parameters supplied by
 * the program. There is no property access, no strings, no assignment and no
 * way to reach JavaScript: the text is parsed into a tiny tree and evaluated
 * by this module only. Sampling happens natively, so one curve is one node in
 * the program's work bound however many points it draws.
 */
export type CurveNode =
  | { k: 'num'; v: number }
  | { k: 'var'; n: string }
  | { k: 'neg'; a: CurveNode }
  | { k: 'bin'; op: '+' | '-' | '*' | '/' | '^'; a: CurveNode; b: CurveNode }
  | { k: 'call'; f: string; args: CurveNode[] };

export const CURVE_LIMITS = { characters: 400, nodes: 256, depth: 32, samples: 512 } as const;
const CONSTANTS: Record<string, number> = { pi: Math.PI, 'π': Math.PI, e: Math.E, tau: 2 * Math.PI };
const FUNCTIONS: Record<string, { min: number; max: number; fn: (...values: number[]) => number }> = {
  sin: { min: 1, max: 1, fn: Math.sin }, cos: { min: 1, max: 1, fn: Math.cos }, tan: { min: 1, max: 1, fn: Math.tan },
  asin: { min: 1, max: 1, fn: Math.asin }, acos: { min: 1, max: 1, fn: Math.acos }, atan: { min: 1, max: 1, fn: Math.atan },
  atan2: { min: 2, max: 2, fn: Math.atan2 },
  sinh: { min: 1, max: 1, fn: Math.sinh }, cosh: { min: 1, max: 1, fn: Math.cosh }, tanh: { min: 1, max: 1, fn: Math.tanh },
  exp: { min: 1, max: 1, fn: Math.exp }, ln: { min: 1, max: 1, fn: Math.log }, log: { min: 1, max: 1, fn: Math.log },
  log10: { min: 1, max: 1, fn: Math.log10 }, log2: { min: 1, max: 1, fn: Math.log2 },
  sqrt: { min: 1, max: 1, fn: Math.sqrt }, cbrt: { min: 1, max: 1, fn: Math.cbrt }, abs: { min: 1, max: 1, fn: Math.abs },
  floor: { min: 1, max: 1, fn: Math.floor }, ceil: { min: 1, max: 1, fn: Math.ceil }, round: { min: 1, max: 1, fn: Math.round },
  sign: { min: 1, max: 1, fn: Math.sign }, pow: { min: 2, max: 2, fn: Math.pow },
  mod: { min: 2, max: 2, fn: (a, b) => b === 0 ? NaN : ((a % b) + b) % b },
  min: { min: 2, max: 8, fn: Math.min }, max: { min: 2, max: 8, fn: Math.max }, hypot: { min: 2, max: 8, fn: Math.hypot },
};
export const CURVE_FUNCTION_NAMES = Object.freeze(Object.keys(FUNCTIONS));

type Token = { t: 'num'; v: number; at: number } | { t: 'id'; v: string; at: number } | { t: 'op'; v: string; at: number };
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let at = 0;
  while (at < text.length) {
    const char = text[at];
    if (/\s/.test(char)) { at++; continue; }
    const number = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(text.slice(at));
    if (number) { tokens.push({ t: 'num', v: Number(number[0]), at }); at += number[0].length; continue; }
    const id = /^(?:[A-Za-z_][A-Za-z0-9_]*|π)/.exec(text.slice(at));
    if (id) { tokens.push({ t: 'id', v: id[0], at }); at += id[0].length; continue; }
    const op = { '×': '*', '·': '*', '÷': '/', '−': '-', '（': '(', '）': ')', '，': ',' }[char] || char;
    if ('+-*/^(),'.includes(op)) { tokens.push({ t: 'op', v: op, at }); at++; continue; }
    throw new CurveSyntaxError(`第 ${at + 1} 个字符“${char}”不是式子里能用的符号。`, at);
  }
  return tokens;
}
export class CurveSyntaxError extends Error { constructor(message: string, readonly at?: number) { super(message); } }

/** Parse with standard precedence: ^ (right) > unary − > * / (and implicit
 * multiplication such as 2x, 2pi, 3(x+1)) > + −. */
export function parseCurveExpression(text: string): CurveNode {
  if (typeof text !== 'string' || !text.trim()) throw new CurveSyntaxError('式子是空的。');
  if (Array.from(text).length > CURVE_LIMITS.characters) throw new CurveSyntaxError(`式子太长了（最多 ${CURVE_LIMITS.characters} 个字符）。`);
  const tokens = tokenize(text);
  let index = 0, nodes = 0;
  const peek = () => tokens[index];
  const node = (value: CurveNode) => { if (++nodes > CURVE_LIMITS.nodes) throw new CurveSyntaxError('式子太复杂了，请拆短一点。'); return value; };
  const expect = (value: string) => {
    const token = peek();
    if (!token || token.t !== 'op' || token.v !== value) throw new CurveSyntaxError(`这里少了“${value}”。`, token?.at);
    index++;
  };
  const startsPrimary = (token?: Token) => !!token && (token.t === 'num' || token.t === 'id' || token.t === 'op' && token.v === '(');
  function expression(depth: number): CurveNode {
    if (depth > CURVE_LIMITS.depth) throw new CurveSyntaxError('式子嵌套太深了。');
    let left = term(depth + 1);
    while (peek()?.t === 'op' && (peek()!.v === '+' || peek()!.v === '-')) {
      const op = peek()!.v as '+' | '-'; index++;
      left = node({ k: 'bin', op, a: left, b: term(depth + 1) });
    }
    return left;
  }
  function term(depth: number): CurveNode {
    let left = unary(depth + 1);
    for (;;) {
      const token = peek();
      if (token?.t === 'op' && (token.v === '*' || token.v === '/')) { index++; left = node({ k: 'bin', op: token.v as '*' | '/', a: left, b: unary(depth + 1) }); continue; }
      if (startsPrimary(token)) { left = node({ k: 'bin', op: '*', a: left, b: power(depth + 1) }); continue; }
      return left;
    }
  }
  function unary(depth: number): CurveNode {
    const token = peek();
    if (token?.t === 'op' && (token.v === '-' || token.v === '+')) { index++; const value = unary(depth + 1); return token.v === '-' ? node({ k: 'neg', a: value }) : value; }
    return power(depth + 1);
  }
  function power(depth: number): CurveNode {
    const base = primary(depth + 1);
    if (peek()?.t === 'op' && peek()!.v === '^') { index++; return node({ k: 'bin', op: '^', a: base, b: unary(depth + 1) }); }
    return base;
  }
  function primary(depth: number): CurveNode {
    if (depth > CURVE_LIMITS.depth) throw new CurveSyntaxError('式子嵌套太深了。');
    const token = peek();
    if (!token) throw new CurveSyntaxError('式子在这里还没写完。');
    if (token.t === 'num') { index++; return node({ k: 'num', v: token.v }); }
    if (token.t === 'op' && token.v === '(') { index++; const inner = expression(depth + 1); expect(')'); return inner; }
    if (token.t === 'id') {
      index++;
      if (peek()?.t === 'op' && peek()!.v === '(') {
        const fn = Object.hasOwn(FUNCTIONS, token.v.toLowerCase()) ? FUNCTIONS[token.v.toLowerCase()] : undefined;
        if (!fn) throw new CurveSyntaxError(`不认识函数“${token.v}”。能用的有：${CURVE_FUNCTION_NAMES.join('、')}。`, token.at);
        index++;
        const args: CurveNode[] = [];
        if (!(peek()?.t === 'op' && peek()!.v === ')')) {
          args.push(expression(depth + 1));
          while (peek()?.t === 'op' && peek()!.v === ',') { index++; args.push(expression(depth + 1)); }
        }
        expect(')');
        if (args.length < fn.min || args.length > fn.max) throw new CurveSyntaxError(`函数 ${token.v} 需要 ${fn.min === fn.max ? fn.min : `${fn.min}–${fn.max}`} 个参数。`, token.at);
        return node({ k: 'call', f: token.v.toLowerCase(), args });
      }
      return node({ k: 'var', n: token.v });
    }
    throw new CurveSyntaxError(`这里不该出现“${token.v}”。`, token.at);
  }
  const root = expression(0);
  if (index < tokens.length) throw new CurveSyntaxError(`“${tokens[index].t === 'op' ? tokens[index].v : String(tokens[index].v)}”之后的部分接不上。`, tokens[index].at);
  return root;
}

/** Names the expression reads that are not functions (constants included). */
export function curveIdentifiers(node: CurveNode, into = new Set<string>()): Set<string> {
  if (node.k === 'var') into.add(node.n);
  else if (node.k === 'neg') curveIdentifiers(node.a, into);
  else if (node.k === 'bin') { curveIdentifiers(node.a, into); curveIdentifiers(node.b, into); }
  else if (node.k === 'call') node.args.forEach(arg => curveIdentifiers(arg, into));
  return into;
}
/** Every name must be the curve variable, a known constant or a given parameter. */
export function checkCurveNames(node: CurveNode, allowed: Iterable<string>): string | undefined {
  const known = new Set([...allowed, ...Object.keys(CONSTANTS)]);
  const unknown = [...curveIdentifiers(node)].filter(name => !known.has(name));
  return unknown.length ? `式子里的 ${unknown.join('、')} 没有给出数值；请放进 params，或改用曲线变量。` : undefined;
}

export function evaluateCurve(node: CurveNode, scope: Readonly<Record<string, number | null>>): number | null {
  const run = (value: CurveNode): number => {
    switch (value.k) {
      case 'num': return value.v;
      case 'var': {
        const bound = Object.hasOwn(scope, value.n) ? scope[value.n] : Object.hasOwn(CONSTANTS, value.n) ? CONSTANTS[value.n] : undefined;
        return typeof bound === 'number' ? bound : NaN;
      }
      case 'neg': return -run(value.a);
      case 'bin': {
        const a = run(value.a), b = run(value.b);
        return value.op === '+' ? a + b : value.op === '-' ? a - b : value.op === '*' ? a * b : value.op === '/' ? (b === 0 ? NaN : a / b) : Math.pow(a, b);
      }
      case 'call': return FUNCTIONS[value.f].fn(...value.args.map(run));
    }
  };
  const result = run(node);
  return Number.isFinite(result) ? result : null;
}

/** Sample y = f(v) (or x(v), y(v) when xNode is given) over [from, to].
 * Undefined or non-finite points become gaps, never invented values. */
export function sampleCurve(input: { y: CurveNode; x?: CurveNode; variable: string; from: number; to: number; samples: number;
  params: Readonly<Record<string, number | null>> }): ({ x: number; y: number } | null)[] {
  const count = Math.max(2, Math.min(CURVE_LIMITS.samples, Math.floor(input.samples)));
  if (!Number.isFinite(input.from) || !Number.isFinite(input.to)) return [];
  const points: ({ x: number; y: number } | null)[] = [];
  for (let index = 0; index < count; index++) {
    const v = input.from + (input.to - input.from) * (index / (count - 1));
    const scope = { ...input.params, [input.variable]: v };
    const y = evaluateCurve(input.y, scope), x = input.x ? evaluateCurve(input.x, scope) : v;
    points.push(x === null || y === null ? null : { x, y });
  }
  return points;
}
