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
    <div className="relative flex gap-4 mb-4 min-w-0">
      {/* Step number and icon */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className="relative z-10 bg-background">
          <div className="flex items-center justify-center size-10 rounded-full bg-primary text-primary-foreground font-semibold text-sm shadow-sm">
            {step}
          </div>
          <div
            className={`absolute -bottom-2 -right-2 flex items-center justify-center w-6 h-6 rounded-full bg-background border shadow-sm ${iconBorderColorMap[icon] || 'border-primary'}`}
          >
            <Icon
              className={`size-3.5 ${iconColorMap[icon] || 'text-primary'}`}
            />
          </div>
        </div>
        {/* Connector line - extends from badge through content to next step */}
        {!isLast && (
          <div className="w-0.5 bg-border mt-2 flex-1 min-h-[2rem]" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 pt-1 min-w-0">
        <div className="mb-2">
          <span className="font-semibold text-foreground mr-2">{actor}:</span>{' '}
          <span className="text-muted-foreground">{description}</span>
        </div>
        {children && <div className="mt-3 min-w-0">{children}</div>}
      </div>
    </div>
  );
}
