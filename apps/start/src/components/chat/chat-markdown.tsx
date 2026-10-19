import { isValidElement, memo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/utils/cn';

/**
 * Markdown renderer used for assistant text parts in the chat. Tight
 * scope: bullets, ordered lists, headings, code, links, tables.
 *
 * Memoized so repeated streaming re-renders of the same chunk skip
 * the markdown parse when the content hasn't changed.
 */
/** Numbers, money and percentages, so they line up on the right like in the tool tables. */
const NUMERIC_CELL = /^[\s$€£+\-−]*[\d.,]+\s*(%|[A-Z]{3})?\s*$/;

function cellText(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(cellText).join('');
  }
  if (isValidElement<{ children?: ReactNode }>(children)) {
    return cellText(children.props.children);
  }
  return '';
}

function ChatMarkdownInner({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // Reasonable readable defaults for a chat surface: 14px body,
        // 1.6 line height, list/heading rhythm.
        'text-foreground leading-[1.6]',
        // Element styling via descendant selectors keeps the API tiny
        // (no per-element override props for callers).
        '[&>*+*]:mt-2',
        '[&_p]:my-0',
        '[&_p+p]:mt-2',
        '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_li]:my-0.5',
        '[&_li>p]:my-0',
        '[&_h1]:mt-3 [&_h1]:mb-1 [&_h1]:font-semibold',
        '[&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:font-semibold',
        '[&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:font-medium',
        '[&_strong]:font-semibold',
        '[&_em]:italic',
        '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:no-underline',
        '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12.5px]',
        '[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-[12.5px]',
        '[&_pre>code]:bg-transparent [&_pre>code]:p-0',
        '[&_blockquote]:border-muted-foreground/30 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
        '[&_hr]:my-3 [&_hr]:border-border',
        className
      )}
    >
      <ReactMarkdown
        components={{
          // Tables get the same card the tool tables use.
          table: ({ children }) => (
            <div className="my-2 overflow-hidden rounded-xl border bg-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">{children}</table>
              </div>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="text-left text-muted-foreground text-xs">
              {children}
            </thead>
          ),
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr className="border-t first:border-t-0">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="whitespace-nowrap px-3 py-1.5 font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => {
            const text = cellText(children);
            return (
              <td
                className={cn(
                  'max-w-[320px] truncate px-3 py-1.5',
                  NUMERIC_CELL.test(text) && 'text-right font-mono tabular-nums'
                )}
                title={text}
              >
                {children}
              </td>
            );
          },
          // Open external links in a new tab; safe defaults.
          a: ({ href, children, ...rest }) => (
            <a
              {...rest}
              href={href}
              rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
              target={href?.startsWith('http') ? '_blank' : undefined}
            >
              {children}
            </a>
          ),
        }}
        remarkPlugins={[remarkGfm]}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export const ChatMarkdown = memo(ChatMarkdownInner);
