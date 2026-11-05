import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface HeroPillProps {
  label: string;
  text: string;
  // Phones get this instead of `text` so the pill stays on one line
  shortText?: string;
  href: string;
  className?: string;
  style?: React.CSSProperties;
}

export function HeroPill({
  label,
  text,
  shortText,
  href,
  className,
  style,
}: HeroPillProps) {
  return (
    <Link
      className={cn(
        'row max-w-full items-center gap-2 whitespace-nowrap rounded-full bg-white py-1 pr-3 pl-1 text-sm shadow-sm ring-1 ring-black/6 transition-colors hover:bg-neutral-50',
        className
      )}
      href={href}
      style={style}
    >
      <span className="shrink-0 rounded-full bg-neutral-900 px-2 py-0.5 font-medium text-[11px] text-white">
        {label}
      </span>
      <span className="min-w-0 truncate text-neutral-600">
        {shortText ? (
          <>
            <span className="sm:hidden">{shortText}</span>
            <span className="max-sm:hidden">{text}</span>
          </>
        ) : (
          text
        )}
      </span>
      <ArrowRightIcon className="size-3.5 shrink-0 text-neutral-400" />
    </Link>
  );
}
