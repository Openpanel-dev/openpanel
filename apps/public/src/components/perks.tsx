import type { LucideIcon } from 'lucide-react';
import type React from 'react';
import { cn } from '@/lib/utils';

type PerkIcon = LucideIcon | React.ComponentType<{ className?: string }>;

export function Perks({
  perks,
  className,
}: {
  perks: { text: string; icon: PerkIcon }[];
  className?: string;
}) {
  return (
    <ul className={cn('grid grid-cols-2 gap-2', className)}>
      {perks.map((perk) => (
        <li className="text-muted-foreground text-sm" key={perk.text}>
          <perk.icon className="relative -top-px mr-2 inline-block size-4" />
          {perk.text}
        </li>
      ))}
    </ul>
  );
}
