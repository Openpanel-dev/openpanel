import type { TooltipProps } from 'recharts';

export type HtmlProps<T> = Omit<
  React.DetailedHTMLProps<React.HTMLAttributes<T>, T>,
  'ref'
>;
export type IToolTipProps<T> = Omit<TooltipProps<number, string>, 'payload'> & {
  payload?: T[];
};
