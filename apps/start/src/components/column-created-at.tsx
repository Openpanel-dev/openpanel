import { formatDateTime, timeAgo } from '@/utils/date';

export function ColumnCreatedAt({ children }: { children: Date | string }) {
  return (
    <div className="relative">
      <div className="absolute inset-0 opacity-0 group-hover/row:opacity-100 transition-opacity duration-100">
        {formatDateTime(
          typeof children === 'string' ? new Date(children) : children,
        )}
      </div>
      <div className="text-muted-foreground group-hover/row:opacity-0 transition-opacity duration-100">
        {timeAgo(typeof children === 'string' ? new Date(children) : children)}
      </div>
    </div>
  );
}

ColumnCreatedAt.size = 150;
