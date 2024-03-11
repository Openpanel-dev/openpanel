import { useEffect, useState } from 'react';
import { api } from '@/app/_trpc/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/utils/cn';
import type { EventMeta } from '@openpanel/db';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import * as Icons from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

const variants = cva('flex items-center justify-center shrink-0 rounded-full', {
  variants: {
    size: {
      sm: 'w-6 h-6',
      default: 'w-10 h-10',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

type EventIconProps = VariantProps<typeof variants> & {
  name: string;
  meta?: EventMeta;
  projectId: string;
  className?: string;
};

export const EventIconRecords: Record<
  string,
  {
    icon: string;
    color: string;
  }
> = {
  default: {
    icon: 'BotIcon',
    color: 'slate',
  },
  screen_view: {
    icon: 'MonitorPlayIcon',
    color: 'blue',
  },
  session_start: {
    icon: 'ActivityIcon',
    color: 'teal',
  },
  link_out: {
    icon: 'ExternalLinkIcon',
    color: 'indigo',
  },
};

export const EventIconMapper: Record<string, LucideIcon> = {
  DownloadIcon: Icons.DownloadIcon,
  BotIcon: Icons.BotIcon,
  BoxIcon: Icons.BoxIcon,
  AccessibilityIcon: Icons.AccessibilityIcon,
  ActivityIcon: Icons.ActivityIcon,
  AirplayIcon: Icons.AirplayIcon,
  AlarmCheckIcon: Icons.AlarmCheckIcon,
  AlertTriangleIcon: Icons.AlertTriangleIcon,
  BellIcon: Icons.BellIcon,
  BoltIcon: Icons.BoltIcon,
  CandyIcon: Icons.CandyIcon,
  ConeIcon: Icons.ConeIcon,
  MonitorPlayIcon: Icons.MonitorPlayIcon,
  PizzaIcon: Icons.PizzaIcon,
  SearchIcon: Icons.SearchIcon,
  HomeIcon: Icons.HomeIcon,
  MailIcon: Icons.MailIcon,
  AngryIcon: Icons.AngryIcon,
  AnnoyedIcon: Icons.AnnoyedIcon,
  ArchiveIcon: Icons.ArchiveIcon,
  AwardIcon: Icons.AwardIcon,
  BadgeCheckIcon: Icons.BadgeCheckIcon,
  BeerIcon: Icons.BeerIcon,
  BluetoothIcon: Icons.BluetoothIcon,
  BookIcon: Icons.BookIcon,
  BookmarkIcon: Icons.BookmarkIcon,
  BookCheckIcon: Icons.BookCheckIcon,
  BookMinusIcon: Icons.BookMinusIcon,
  BookPlusIcon: Icons.BookPlusIcon,
  CalendarIcon: Icons.CalendarIcon,
  ClockIcon: Icons.ClockIcon,
  CogIcon: Icons.CogIcon,
  LoaderIcon: Icons.LoaderIcon,
  CrownIcon: Icons.CrownIcon,
  FileIcon: Icons.FileIcon,
  KeyRoundIcon: Icons.KeyRoundIcon,
  GemIcon: Icons.GemIcon,
  GlobeIcon: Icons.GlobeIcon,
  LightbulbIcon: Icons.LightbulbIcon,
  LightbulbOffIcon: Icons.LightbulbOffIcon,
  LockIcon: Icons.LockIcon,
  MessageCircleIcon: Icons.MessageCircleIcon,
  RadioIcon: Icons.RadioIcon,
  RepeatIcon: Icons.RepeatIcon,
  ShareIcon: Icons.ShareIcon,
  ExternalLinkIcon: Icons.ExternalLinkIcon,
};

export const EventIconColors = [
  'rose',
  'pink',
  'fuchsia',
  'purple',
  'violet',
  'indigo',
  'blue',
  'sky',
  'cyan',
  'teal',
  'emerald',
  'green',
  'lime',
  'yellow',
  'amber',
  'orange',
  'red',
  'stone',
  'neutral',
  'zinc',
  'grey',
  'slate',
];

export function EventIcon({ className, name, size, meta }: EventIconProps) {
  const Icon =
    EventIconMapper[
      meta?.icon ??
        EventIconRecords[name]?.icon ??
        EventIconRecords.default?.icon ??
        ''
    ]!;
  const color =
    meta?.color ??
    EventIconRecords[name]?.color ??
    EventIconRecords.default?.color ??
    '';

  return (
    <div className={cn(`bg-${color}-200`, variants({ size }), className)}>
      <Icon size={20} className={`text-${color}-700`} />
    </div>
  );
}
