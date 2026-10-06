import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

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
export function RichText({ text, publicSurface = false }: { text: string; publicSurface?: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[
        [rehypeKatex, { trust: false, throwOnError: false, strict: 'ignore', maxExpand: 1000, maxSize: 20 }],
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
      {mathDelimiters(text)}
    </ReactMarkdown>
  );
}
