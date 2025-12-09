import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export function Perks({
  perks,
  className,
}: { perks: { text: string; icon: LucideIcon }[]; className?: string }) {
  return (
    <ul className={cn('grid grid-cols-2 gap-2', className)}>
      {perks.map((perk) => (
        <li key={perk.text} className="text-sm text-muted-foreground">
          <perk.icon className="size-4 inline-block mr-2 relative -top-px" />
          {perk.text}
        </li>
      ))}
    </ul>
  );
}
