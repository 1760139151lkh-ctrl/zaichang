import test from 'node:test';
import assert from 'node:assert/strict';
import { compileInteractiveProgram, validateProgramStateAndEvaluate } from '../../src/main/runtime/interactive-program-compiler';
import { checkCurveNames, evaluateCurve, parseCurveExpression, sampleCurve, CurveSyntaxError } from '../../src/shared/curve-expression';
import { PROGRAM_LIBRARY_VERSION } from '../../src/shared/interactive-program';

test('the curve language is closed: math only, standard precedence, gaps instead of invented values', () => {
  const at = (text: string, scope: Record<string, number> = {}) => evaluateCurve(parseCurveExpression(text), scope);
  assert.equal(at('1+2*3^2'), 19);
  assert.equal(at('-x^2', { x: 3 }), -9);
  assert.equal(at('2^-1'), 0.5);
  assert.ok(Math.abs(at('2pi')! - 2 * Math.PI) < 1e-12, 'implicit multiplication');
  assert.ok(Math.abs(at('A*sin(k*x - w*t + p)', { A: 2, k: 1, x: Math.PI / 2, w: 0, t: 0, p: 0 })! - 2) < 1e-12);
  assert.equal(at('1/(x-1)', { x: 1 }), null, 'a pole is a gap, not Infinity');
  assert.equal(at('sqrt(x)', { x: -1 }), null);
  // Anything that is not math is refused when parsed or when its names are checked.
  for (const hostile of ['constructor', 'constructor(1)', 'x.constructor', 'process.exit(1)', 'this', '`1`', '"a"', 'a=1', 'x;1', 'eval(1)', 'sin(x', '__proto__'])
    assert.throws(() => { const problem = checkCurveNames(parseCurveExpression(hostile), ['x']); if (problem) throw new CurveSyntaxError(problem); }, CurveSyntaxError, hostile);
  assert.equal(at('constructor'), null, 'an unknown name never reaches an inherited property');
  assert.throws(() => parseCurveExpression('x+'.repeat(300) + 'x'), CurveSyntaxError, 'size is bounded');
  const points = sampleCurve({ y: parseCurveExpression('1/x'), variable: 'x', from: -1, to: 1, samples: 3, params: {} });
  assert.deepEqual(points, [{ x: -1, y: -1 }, null, { x: 1, y: 1 }]);
});

const states = {
  a1: { kind: 'number', initial: 1, min: 0, max: 2, step: 0.1 },
  a2: { kind: 'number', initial: 1, min: 0, max: 2, step: 0.1 },
  phase: { kind: 'number', initial: 0, min: -3.2, max: 3.2, step: 0.1 },
} as const;

test('two waves and their sum compile as three curves bound to sliders, far inside the work bound', () => {
  const dsl = [
    'root = Document("waves", $ui, [plot, c1, c2, c3], "两列波怎样叠加")',
    'plot = Graphic("plot", {xMin: 0, xMax: 12.6, yMin: -4, yMax: 4}, "两列波与合成波", [w1, w2, sum], 280, "up", true, "x", "y")',
    'w1 = Curve("w1", "a*sin(x)", 0, 12.6, {a: $ui.a1}, "blue", 240)',
    'w2 = Curve("w2", "a*sin(x + p)", 0, 12.6, {a: $ui.a2, p: $ui.phase}, "green", 240)',
    'sum = Curve("sum", "a*sin(x) + b*sin(x + p)", 0, 12.6, {a: $ui.a1, b: $ui.a2, p: $ui.phase}, "accent", 240, 2.5)',
    'c1 = Number("c1", "a1", "第一列振幅")',
    'c2 = Number("c2", "a2", "第二列振幅")',
    'c3 = Number("c3", "phase", "相位差")',
  ].join('\n');
  const program = compileInteractiveProgram({ libraryVersion: PROGRAM_LIBRARY_VERSION, dsl, states: structuredClone(states) as never, bindings: [] });
  assert.ok(program.stats.expandedNodes < 100, `expanded ${program.stats.expandedNodes}`);
  assert.ok(program.nodeIds.includes('sum'));
  // Moving the phase to π is a different state of the same program, evaluated by the host.
  const evaluated = validateProgramStateAndEvaluate(program, { a1: 1, a2: 1, phase: 3.1 });
  assert.equal(evaluated.inputs.phase, 3.1);
});

test('an unfamiliar relation needs no new component: a damped oscillation and a parametric circle', () => {
  const dsl = [
    'root = Document("other", $ui, [plot, k])',
    'plot = Graphic("plot", {xMin: -2, xMax: 10, yMin: -2, yMax: 2}, "衰减振动与单位圆", [decay, circle], 260, "up", true)',
    'decay = Curve("decay", "exp(-k*x)*cos(3x)", 0, 10, {k: $ui.k}, "rose")',
    'circle = Curve("circle", "sin(t)", 0, 6.3, {}, "muted", 120, 1.5, false, "t", "cos(t)")',
    'k = Number("kSlider", "k", "衰减快慢")',
  ].join('\n');
  const program = compileInteractiveProgram({ libraryVersion: PROGRAM_LIBRARY_VERSION, dsl,
    states: { k: { kind: 'number', initial: 0.3, min: 0, max: 2, step: 0.05 } } as never, bindings: [] });
  assert.ok(program.nodeIds.includes('circle'));
});

test('a mistyped expression fails at compile time with a readable reason, not a blank picture', () => {
  const dsl = [
    'root = Document("bad", $ui, [plot])',
    'plot = Graphic("plot", {xMin: 0, xMax: 1, yMin: 0, yMax: 1}, "画布", [c])',
    'c = Curve("c", "a*sin(x", 0, 1, {a: 1})',
  ].join('\n');
  assert.throws(() => compileInteractiveProgram({ libraryVersion: PROGRAM_LIBRARY_VERSION, dsl, states: {} as never, bindings: [] }),
    (error: Error) => /少了|接不上|写得不对|没写完/.test(error.message + JSON.stringify((error as any).diagnostic || {})));
  const unknownName = dsl.replace('"a*sin(x"', '"a*sin(x) + q"');
  assert.throws(() => compileInteractiveProgram({ libraryVersion: PROGRAM_LIBRARY_VERSION, dsl: unknownName, states: {} as never, bindings: [] }),
    (error: Error) => /q/.test(error.message + JSON.stringify((error as any).diagnostic || {})));
});
