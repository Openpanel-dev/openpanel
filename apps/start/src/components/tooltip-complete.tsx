import { TooltipPortal } from '@radix-ui/react-tooltip';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

interface TooltipCompleteProps {
  children: React.ReactNode | string;
  content: React.ReactNode | string;
  disabled?: boolean;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delay?: number;
}

export function TooltipComplete({
  children,
  disabled,
  content,
  side,
  delay,
}: TooltipCompleteProps) {
  return (
    <Tooltip delayDuration={delay}>
      <TooltipTrigger
        className="appearance-none"
        style={{ textAlign: 'inherit' }}
      >
        {children}
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent side={side} disabled={disabled}>
          {content}
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}
