import { CheckCircle, CreditCard, Globe, Server, User } from 'lucide-react';
import type { ReactNode } from 'react';

interface FlowStepProps {
  step: number;
  actor: string;
  description: string;
  children?: ReactNode;
  icon?: 'visitor' | 'website' | 'backend' | 'payment' | 'success';
  isLast?: boolean;
}

const iconMap = {
  visitor: User,
  website: Globe,
  backend: Server,
  payment: CreditCard,
  success: CheckCircle,
};

const iconColorMap = {
  visitor: 'text-blue-500',
  website: 'text-green-500',
  backend: 'text-purple-500',
  payment: 'text-yellow-500',
  success: 'text-green-600',
};

const iconBorderColorMap = {
  visitor: 'border-blue-500',
  website: 'border-green-500',
  backend: 'border-purple-500',
  payment: 'border-yellow-500',
  success: 'border-green-600',
};

export function FlowStep({
  step,
  actor,
  description,
  children,
  icon = 'visitor',
  isLast = false,
}: FlowStepProps) {
  const Icon = iconMap[icon];

  return (
    <div className="relative mb-4 flex min-w-0 gap-4">
      {/* Step number and icon */}
      <div className="flex shrink-0 flex-col items-center">
        <div className="relative z-10 bg-background">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-sm shadow-sm">
            {step}
          </div>
          <div
            className={`absolute -right-2 -bottom-2 flex h-6 w-6 items-center justify-center rounded-full border bg-background shadow-sm ${iconBorderColorMap[icon] || 'border-primary'}`}
          >
            <Icon
              className={`size-3.5 ${iconColorMap[icon] || 'text-primary'}`}
            />
          </div>
        </div>
        {/* Connector line - extends from badge through content to next step */}
        {!isLast && (
          <div className="mt-2 min-h-[2rem] w-0.5 flex-1 bg-border" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pt-1">
        <div className="mb-2">
          <span className="mr-2 font-semibold text-foreground">{actor}:</span>{' '}
          <span className="text-muted-foreground">{description}</span>
        </div>
        {children && <div className="mt-3 min-w-0">{children}</div>}
      </div>
    </div>
  );
}
