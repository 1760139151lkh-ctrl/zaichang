import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface SourceNode {
  type?: string; value?: string; tagName?: string; properties?: Record<string, unknown>;
  position?: { start?: { offset?: number }; end?: { offset?: number } };
  children?: SourceNode[];
}

/** Reuse the Markdown parser's real source positions for literal text only.
 * Generated math, decoded entities and replacements receive no forged range. */
function sourceTextPositions({ source }: { source: string }) {
  return (tree: unknown) => {
    const visit = (node: SourceNode) => {
      if (!Array.isArray(node.children)) return;
      node.children = node.children.map(child => {
        const start = child.position?.start?.offset, end = child.position?.end?.offset;
        if (child.type === 'text' && typeof child.value === 'string' && Number.isSafeInteger(start) && Number.isSafeInteger(end)
          && start! >= 0 && end! > start! && source.slice(start, end) === child.value) {
          return { type: 'element', tagName: 'span', properties: {
            'data-focus-start': Array.from(source.slice(0, start)).length,
            'data-focus-end': Array.from(source.slice(0, end)).length,
          }, children: [child] };
        }
        visit(child); return child;
      });
    };
    if (tree && typeof tree === 'object') visit(tree as SourceNode);
  };
}

/** Normalize common TeX delimiters outside fenced/inline code only. */
function mathDelimiters(text: string) {
  return text
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g)
    .map((part, index) =>
      index % 2
        ? part
        : part
            .replace(/\\\[([\s\S]*?)\\\]/g, (_match, body) => '\n$$\n' + body + '\n$$\n')
            .replace(/\\\(([^\n]*?)\\\)/g, (_match, body) => '$' + body + '$'),
    )
    .join('');
}
export function RichText({ text, publicSurface = false, sourceFocus = false }: { text: string; publicSurface?: boolean; sourceFocus?: boolean }) {
  const renderedText = mathDelimiters(text);
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[
        [rehypeKatex, { trust: false, throwOnError: false, strict: 'ignore', maxExpand: 1000, maxSize: 20 }],
        ...(sourceFocus && renderedText === text ? [[sourceTextPositions, { source: text }] as [typeof sourceTextPositions, { source: string }]] : []),
      ]}
      components={{
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
      {renderedText}
    </ReactMarkdown>
  );
}
