import type { HtmlProps } from '@/types';

type PageTitleProps = HtmlProps<HTMLDivElement>;

export function PageTitle({ children }: PageTitleProps) {
  return (
    <div className="my-8 flex justify-between border-b border-border py-4">
      <h1 className="h1">{children}</h1>
    </div>
  );
}
