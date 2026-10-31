import { cn } from '@/lib/utils';

export interface CodeLine {
  text: string;
  tone?: 'muted' | 'string' | 'keyword';
}

// A dark code block in the site's one code style. `tabs` draws the SDK
// switcher row at the top; the first tab is the active one.
export function CodeSnippet({
  lines,
  tabs,
  className,
  compact = false,
}: {
  lines: CodeLine[];
  tabs?: string[];
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'overflow-hidden rounded-2xl bg-neutral-900 text-left text-neutral-200 shadow-[0_30px_60px_-24px_rgba(0,0,0,0.35)]',
        compact && 'rounded-xl shadow-none',
        className
      )}
    >
      {tabs && (
        <div className="row items-center gap-4 border-white/10 border-b px-5 py-3 text-[12px]">
          {tabs.map((tab, index) => (
            <span
              className={
                index === 0 ? 'font-medium text-white' : 'text-neutral-500'
              }
              key={tab}
            >
              {tab}
            </span>
          ))}
        </div>
      )}
      <pre
        className={cn(
          'overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed',
          compact && 'p-4 text-[11.5px] leading-[1.55]'
        )}
      >
        {lines.map((line, index) => (
          <div
            className={cn(
              line.tone === 'string' && 'text-emerald-300',
              line.tone === 'keyword' && 'text-sky-300',
              line.tone === 'muted' && 'text-neutral-500'
            )}
            // biome-ignore lint/suspicious/noArrayIndexKey: static lines, some of them blank
            key={index}
          >
            {line.text || ' '}
          </div>
        ))}
      </pre>
    </div>
  );
}
