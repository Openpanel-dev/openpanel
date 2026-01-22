import { LogoSquare } from '@/components/logo';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { UsersIcon } from 'lucide-react';
import { z } from 'zod';

const widgetSearchSchema = z.object({
  shareId: z.string(),
  color: z.string().optional(),
});

export const Route = createFileRoute('/widget/badge')({
  component: RouteComponent,
  validateSearch: widgetSearchSchema,
});

function RouteComponent() {
  const { shareId, color } = Route.useSearch();
  const trpc = useTRPC();

  // Fetch widget data
  const { data, isLoading } = useQuery(
    trpc.widget.badge.queryOptions({ shareId }),
  );

  if (isLoading) {
    return <BadgeWidget visitors={0} isLoading color={color} />;
  }

  if (!data) {
    return <BadgeWidget visitors={0} color={color} />;
  }

  return <BadgeWidget visitors={data.visitors} color={color} />;
}

interface BadgeWidgetProps {
  visitors: number;
  isLoading?: boolean;
  color?: string;
}

function BadgeWidget({ visitors, isLoading, color }: BadgeWidgetProps) {
  const number = useNumber();
  return (
    <div
      className="absolute inset-0 group inline-flex items-center gap-3 rounded-lg center-center px-2"
      style={{
        backgroundColor: color,
      }}
    >
      {/* Logo on the left */}
      <div className="flex-shrink-0">
        <LogoSquare className="h-8 w-8" />
      </div>

      {/* Center text */}
      <div className="flex flex-col gap-0.5 flex-1 min-w-0 items-start -mt-px">
        <div className="text-[10px] font-medium uppercase tracking-wide text-white/80">
          ANALYTICS FROM
        </div>
        <div className="font-semibold text-white leading-tight">OpenPanel</div>
      </div>

      {/* Visitor count on the right */}
      <div className="col center-center flex-shrink-0 gap-1">
        <UsersIcon className="size-4 text-white" />
        <div className="text-sm font-medium text-white tabular-nums">
          {isLoading ? <span>...</span> : number.short(visitors)}
        </div>
      </div>
    </div>
  );
}
