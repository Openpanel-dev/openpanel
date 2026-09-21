import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { UsersIcon } from 'lucide-react';
import { z } from 'zod';
import { LogoSquare } from '@/components/logo';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';

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
    trpc.widget.badge.queryOptions({ shareId })
  );

  if (isLoading) {
    return <BadgeWidget color={color} isLoading visitors={0} />;
  }

  if (!data) {
    return <BadgeWidget color={color} visitors={0} />;
  }

  return <BadgeWidget color={color} visitors={data.visitors} />;
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
      className="group center-center absolute inset-0 inline-flex items-center gap-3 rounded-lg px-2"
      style={{
        backgroundColor: color,
      }}
    >
      {/* Logo on the left */}
      <div className="flex-shrink-0">
        <LogoSquare className="h-8 w-8" />
      </div>

      {/* Center text */}
      <div className="-mt-px flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <div className="font-medium text-[10px] text-white/80 uppercase tracking-wide">
          ANALYTICS FROM
        </div>
        <div className="font-semibold text-white leading-tight">OpenPanel</div>
      </div>

      {/* Visitor count on the right */}
      <div className="col center-center flex-shrink-0 gap-1">
        <UsersIcon className="size-4 text-white" />
        <div className="font-medium text-sm text-white tabular-nums">
          {isLoading ? <span>...</span> : number.short(visitors)}
        </div>
      </div>
    </div>
  );
}
