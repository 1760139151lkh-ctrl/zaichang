import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { ReadableFocus, type LocalTextRange } from './LocalTextFocus';
import 'katex/dist/katex.min.css';

interface SourceNode {
  type?: string; value?: string; tagName?: string; properties?: Record<string, unknown>;
  position?: { start?: { offset?: number }; end?: { offset?: number } };
  children?: SourceNode[];
}
interface LiteralSourceSegment { renderedStart: number; renderedEnd: number; sourceStart: number }
interface FormulaSourceRange { renderedStart: number; renderedEnd: number; sourceStart: number; sourceEnd: number }
interface SourceProjection { text: string; segments: LiteralSourceSegment[]; formulas: FormulaSourceRange[] }
interface SourcePositionOptions { source: string; segments: LiteralSourceSegment[] }

function sourceBoundaries(source: string) {
  const points: (number | undefined)[] = new Array(source.length + 1);
  let rawOffset = 0, pointOffset = 0; points[0] = 0;
  for (const point of source) { rawOffset += point.length; points[rawOffset] = ++pointOffset; }
  return points;
}

/** A formula is one parsed source object. Its entire original TeX range is
 * carried before KaTeX replaces the DOM, never reconstructed from glyphs. */
function sourceFormulaPositions({ source, projection }: { source: string; projection: SourceProjection }) {
  return (tree: unknown) => {
    const points = sourceBoundaries(source);
    const visit = (node: SourceNode) => {
      if (!node.children) return;
      node.children = node.children.map(child => {
        const code = child.tagName === 'pre' ? child.children?.find(value => value.tagName === 'code') : child;
        const classes = code?.properties?.className;
        const math = code?.tagName === 'code' && Array.isArray(classes)
          && classes.some(value => value === 'math-inline' || value === 'math-display' || value === 'language-math');
        const start = child.position?.start?.offset, end = child.position?.end?.offset;
        if (math && start !== undefined && end !== undefined) {
          const formula = projection.formulas.find(value => value.renderedStart <= start && end <= value.renderedEnd);
          const literal = projection.segments.find(value => value.renderedStart <= start && end <= value.renderedEnd);
          const rawStart = formula?.sourceStart ?? (literal && literal.sourceStart + start - literal.renderedStart);
          const rawEnd = formula?.sourceEnd ?? (literal && literal.sourceStart + end - literal.renderedStart);
          const from = rawStart === undefined ? undefined : points[rawStart], to = rawEnd === undefined ? undefined : points[rawEnd];
          if (from !== undefined && to !== undefined && to > from && to - from <= 4000) return {
            type: 'element', tagName: 'span', properties: { 'data-focus-math-start': from, 'data-focus-math-end': to,
              className: ['assistant-source-formula', ...(child.tagName === 'pre' ? ['is-display'] : [])] }, children: [child],
          };
        }
        visit(child); return child;
      });
    };
    if (tree && typeof tree === 'object') visit(tree as SourceNode);
  };
}

/** Reuse the Markdown parser's real source positions for literal text only.
 * Generated math, decoded entities and replacements receive no forged range. */
function sourceTextPositions({ source, segments }: SourcePositionOptions) {
  return (tree: unknown) => {
    const points = sourceBoundaries(source);
    const visit = (node: SourceNode) => {
      if (!Array.isArray(node.children)) return;
      const classes = node.properties?.className;
      if (node.tagName === 'math' || node.tagName === 'svg'
        || (Array.isArray(classes) ? classes : typeof classes === 'string' ? classes.split(/\s+/) : []).includes('katex')) return;
      node.children = node.children.map(child => {
        const start = child.position?.start?.offset, end = child.position?.end?.offset;
        const segment = typeof start === 'number' && typeof end === 'number'
          ? segments.find(value => value.renderedStart <= start && end <= value.renderedEnd) : undefined;
        const rawStart = segment && start! - segment.renderedStart + segment.sourceStart;
        const rawEnd = rawStart === undefined ? undefined : rawStart + end! - start!;
        if (child.type === 'text' && typeof child.value === 'string' && Number.isSafeInteger(start) && Number.isSafeInteger(end)
          && start! >= 0 && end! > start! && rawStart !== undefined && rawEnd !== undefined
          && points[rawStart] !== undefined && points[rawEnd] !== undefined && source.slice(rawStart, rawEnd) === child.value) {
          return { type: 'element', tagName: 'span', properties: {
            'data-focus-start': points[rawStart],
            'data-focus-end': points[rawEnd],
          }, children: [child] };
        }
        visit(child); return child;
      });
    };
    if (tree && typeof tree === 'object') visit(tree as SourceNode);
  };
}

/** Copy only unchanged source intervals. Added delimiters and newlines have
 * no source span, even if their characters also occur elsewhere in the reply. */
function appendSourceSlice(target: SourceProjection, source: SourceProjection, start = 0, end = source.text.length) {
  const offset = target.text.length;
  target.text += source.text.slice(start, end);
  for (const segment of source.segments) {
    const lower = Math.max(start, segment.renderedStart), upper = Math.min(end, segment.renderedEnd);
    if (upper <= lower) continue;
    const next = { renderedStart: offset + lower - start, renderedEnd: offset + upper - start,
      sourceStart: segment.sourceStart + lower - segment.renderedStart };
    const prior = target.segments.at(-1);
    if (prior && prior.renderedEnd === next.renderedStart
      && prior.sourceStart + prior.renderedEnd - prior.renderedStart === next.sourceStart) prior.renderedEnd = next.renderedEnd;
    else target.segments.push(next);
  }
  for (const formula of source.formulas) if (formula.renderedStart >= start && formula.renderedEnd <= end)
    target.formulas.push({ ...formula, renderedStart: offset + formula.renderedStart - start,
      renderedEnd: offset + formula.renderedEnd - start });
}
function replaceMathDelimiters(source: SourceProjection, expression: RegExp, before: string, after: string): SourceProjection {
  const target: SourceProjection = { text: '', segments: [], formulas: [] };
  let cursor = 0;
  for (const match of source.text.matchAll(expression)) {
    const start = match.index;
    const original = source.segments.find(segment => segment.renderedStart <= start && start + match[0].length <= segment.renderedEnd);
    appendSourceSlice(target, source, cursor, start);
    const renderedStart = target.text.length;
    target.text += before;
    appendSourceSlice(target, source, start + 2, start + 2 + match[1].length);
    target.text += after;
    if (original) {
      const sourceStart = original.sourceStart + start - original.renderedStart;
      target.formulas.push({ renderedStart, renderedEnd: target.text.length, sourceStart, sourceEnd: sourceStart + match[0].length });
    }
    cursor = start + match[0].length;
  }
  appendSourceSlice(target, source, cursor);
  return target;
}
/** Preserve the existing two-pass normalization and code protection, while
 * retaining exact positions for literal prose on either side of mathematics. */
function mathDelimiters(text: string): SourceProjection {
  const target: SourceProjection = { text: '', segments: [], formulas: [] };
  const append = (start: number, end: number, code = false) => {
    if (end <= start) return;
    let part: SourceProjection = { text: text.slice(start, end),
      segments: [{ renderedStart: 0, renderedEnd: end - start, sourceStart: start }], formulas: [] };
    if (!code) {
      part = replaceMathDelimiters(part, /\\\[([\s\S]*?)\\\]/g, '\n$$\n', '\n$$\n');
      part = replaceMathDelimiters(part, /\\\(([^\n]*?)\\\)/g, '$', '$');
    }
    appendSourceSlice(target, part);
  };
  let cursor = 0;
  for (const match of text.matchAll(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g)) {
    append(cursor, match.index); append(match.index, match.index + match[0].length, true);
    cursor = match.index + match[0].length;
  }
  append(cursor, text.length);
  return target;
}
export function RichText({ text, publicSurface = false, sourceFocus = false, onFormulaFocus, activeSourceRange }: {
  text: string; publicSurface?: boolean; sourceFocus?: boolean;
  onFormulaFocus?: (range: LocalTextRange) => void; activeSourceRange?: { start: number; end: number };
}) {
  const rendered = mathDelimiters(text);
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[
        ...(sourceFocus && onFormulaFocus ? [[sourceFormulaPositions, { source: text, projection: rendered }] as [typeof sourceFormulaPositions, { source: string; projection: SourceProjection }]] : []),
        [rehypeKatex, { trust: false, throwOnError: false, strict: 'ignore', maxExpand: 1000, maxSize: 20 }],
        ...(sourceFocus ? [[sourceTextPositions, { source: text, segments: rendered.segments }] as [typeof sourceTextPositions, SourcePositionOptions]] : []),
      ]}
      components={{
        span: ({ node, children, ...props }) => {
          const start = Number(node?.properties?.['data-focus-math-start']), end = Number(node?.properties?.['data-focus-math-end']);
          if (!onFormulaFocus || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start) return <span {...props}>{children}</span>;
          return <ReadableFocus inline label="这个公式" active={activeSourceRange?.start === start && activeSourceRange.end === end}
            onFocus={() => onFormulaFocus({ start, end, preview: Array.from(text).slice(start, end).join('') })}>
            <span {...props}>{children}</span>
          </ReadableFocus>;
        },
        img: () => <span className="muted">[图片内容]</span>,
        a: ({ children, href }) =>
          publicSurface ? (
            <span>{children}</span>
          ) : (
            <a
              className="source-reference"
              href={href}
              onClick={(event) => {
                event.preventDefault();
                if (href?.startsWith('https://')) void window.zaichang.openLink(href).catch(() => {});
              }}
            >
              {children}
            </a>
          ),
      }}
    >
      {rendered.text}
    </ReactMarkdown>
  );
}
