import { cn } from '@/utils/cn';
import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Markdown renderer used for assistant text parts in the chat. Tight
 * scope: bullets, ordered lists, headings, code, links, tables.
 *
 * Memoized so repeated streaming re-renders of the same chunk skip
 * the markdown parse when the content hasn't changed.
 */
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
        'leading-[1.6] text-foreground',
        // Element styling via descendant selectors keeps the API tiny
        // (no per-element override props for callers).
        '[&>*+*]:mt-2',
        '[&_p]:my-0',
        '[&_p+p]:mt-2',
        '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2',
        '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2',
        '[&_li]:my-0.5',
        '[&_li>p]:my-0',
        '[&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-1',
        '[&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1',
        '[&_h3]:font-medium [&_h3]:mt-2 [&_h3]:mb-1',
        '[&_strong]:font-semibold',
        '[&_em]:italic',
        '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:no-underline',
        '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12.5px] [&_code]:font-mono',
        '[&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-[12.5px] [&_pre]:overflow-x-auto',
        '[&_pre>code]:bg-transparent [&_pre>code]:p-0',
        '[&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
        '[&_table]:w-full [&_table]:text-sm [&_table]:my-2',
        '[&_th]:text-left [&_th]:font-medium [&_th]:px-2 [&_th]:py-1 [&_th]:border-b',
        '[&_td]:px-2 [&_td]:py-1 [&_td]:border-b [&_td]:border-border/40',
        '[&_hr]:my-3 [&_hr]:border-border',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Open external links in a new tab; safe defaults.
          a: ({ href, children, ...rest }) => (
            <a
              {...rest}
              href={href}
              target={href?.startsWith('http') ? '_blank' : undefined}
              rel={
                href?.startsWith('http') ? 'noopener noreferrer' : undefined
              }
            >
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export const ChatMarkdown = memo(ChatMarkdownInner);
