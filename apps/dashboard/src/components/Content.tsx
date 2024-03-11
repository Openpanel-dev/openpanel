'use client';

import { cn } from '@/utils/cn';

interface ContentHeaderProps {
  title: string;
  text: string;
  children?: React.ReactNode;
}

export function ContentHeader({ title, text, children }: ContentHeaderProps) {
  return (
    <div className="flex items-center justify-between py-6 first:pt-0">
      <div>
        <h2 className="h2">{title}</h2>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}

interface ContentSectionProps {
  title: string;
  text?: string | React.ReactNode;
  children: React.ReactNode;
  asCol?: boolean;
}

export function ContentSection({
  title,
  text,
  children,
  asCol,
}: ContentSectionProps) {
  return (
    <div
      className={cn(
        'first:pt-0] flex py-6',
        asCol ? 'col flex' : 'justify-between'
      )}
    >
      {title && (
        <div className="max-w-[50%]">
          <h4 className="h4">{title}</h4>
          {text && <p className="text-sm text-muted-foreground">{text}</p>}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
}
