import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

interface TooltipCompleteProps {
  children: React.ReactNode | string;
  content: React.ReactNode | string;
  disabled?: boolean;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export function TooltipComplete({
  children,
  disabled,
  content,
  side,
}: TooltipCompleteProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild={typeof children !== 'string'}>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} disabled={disabled}>
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
