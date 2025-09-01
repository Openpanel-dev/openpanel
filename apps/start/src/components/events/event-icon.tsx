import { cn } from '@/utils/cn';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import * as Icons from 'lucide-react';

import type { EventMeta } from '@openpanel/db';

const variants = cva('flex shrink-0 items-center justify-center rounded-full', {
  variants: {
    size: {
      xs: 'h-5 w-5',
      sm: 'h-6 w-6',
      default: 'h-10 w-10',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

type EventIconProps = VariantProps<typeof variants> & {
  name: string;
  meta?: EventMeta;
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
  UserIcon: Icons.UserIcon,
  UsersIcon: Icons.UsersIcon,
  UserPlusIcon: Icons.UserPlusIcon,
  UserMinusIcon: Icons.UserMinusIcon,
  UserCheckIcon: Icons.UserCheckIcon,
  UserXIcon: Icons.UserXIcon,
  PlayIcon: Icons.PlayIcon,
  PauseIcon: Icons.PauseIcon,
  SkipForwardIcon: Icons.SkipForwardIcon,
  SkipBackIcon: Icons.SkipBackIcon,
  VolumeIcon: Icons.VolumeIcon,
  VolumeOffIcon: Icons.VolumeOffIcon,
  ImageIcon: Icons.ImageIcon,
  VideoIcon: Icons.VideoIcon,
  MusicIcon: Icons.MusicIcon,
  CameraIcon: Icons.CameraIcon,
  ClickIcon: Icons.MousePointerClickIcon,
  ChevronDownIcon: Icons.ChevronDownIcon,
  ChevronUpIcon: Icons.ChevronUpIcon,
  ChevronLeftIcon: Icons.ChevronLeftIcon,
  ChevronRightIcon: Icons.ChevronRightIcon,
  ArrowUpIcon: Icons.ArrowUpIcon,
  ArrowDownIcon: Icons.ArrowDownIcon,
  ArrowLeftIcon: Icons.ArrowLeftIcon,
  ArrowRightIcon: Icons.ArrowRightIcon,
  PhoneIcon: Icons.PhoneIcon,
  MessageSquareIcon: Icons.MessageSquareIcon,
  SendIcon: Icons.SendIcon,
  ShoppingCartIcon: Icons.ShoppingCartIcon,
  ShoppingBagIcon: Icons.ShoppingBagIcon,
  CreditCardIcon: Icons.CreditCardIcon,
  DollarSignIcon: Icons.DollarSignIcon,
  EuroIcon: Icons.EuroIcon,
  HeartIcon: Icons.HeartIcon,
  StarIcon: Icons.StarIcon,
  ThumbsUpIcon: Icons.ThumbsUpIcon,
  ThumbsDownIcon: Icons.ThumbsDownIcon,
  SmileIcon: Icons.SmileIcon,
  FrownIcon: Icons.FrownIcon,
  BarChartIcon: Icons.BarChartIcon,
  LineChartIcon: Icons.LineChartIcon,
  PieChartIcon: Icons.PieChartIcon,
  TrendingUpIcon: Icons.TrendingUpIcon,
  TrendingDownIcon: Icons.TrendingDownIcon,
  TargetIcon: Icons.TargetIcon,
  ShieldIcon: Icons.ShieldIcon,
  EyeIcon: Icons.EyeIcon,
  EyeOffIcon: Icons.EyeOffIcon,
  KeyIcon: Icons.KeyIcon,
  UnlockIcon: Icons.UnlockIcon,
  SettingsIcon: Icons.SettingsIcon,
  RefreshCwIcon: Icons.RefreshCwIcon,
  TrashIcon: Icons.TrashIcon,
  EditIcon: Icons.EditIcon,
  PlusIcon: Icons.PlusIcon,
  MinusIcon: Icons.MinusIcon,
  XIcon: Icons.XIcon,
  CheckIcon: Icons.CheckIcon,
  SaveIcon: Icons.SaveIcon,
  UploadIcon: Icons.UploadIcon,
  SmartphoneIcon: Icons.SmartphoneIcon,
  TabletIcon: Icons.TabletIcon,
  LaptopIcon: Icons.LaptopIcon,
  MonitorIcon: Icons.MonitorIcon,
  WifiIcon: Icons.WifiIcon,
  MapPinIcon: Icons.MapPinIcon,
  NavigationIcon: Icons.NavigationIcon,
  CompassIcon: Icons.CompassIcon,
  FolderIcon: Icons.FolderIcon,
  FileTextIcon: Icons.FileTextIcon,
  FilePlusIcon: Icons.FilePlusIcon,
  FileMinusIcon: Icons.FileMinusIcon,
  DatabaseIcon: Icons.DatabaseIcon,
  AlertCircleIcon: Icons.AlertCircleIcon,
  InfoIcon: Icons.InfoIcon,
  HelpCircleIcon: Icons.HelpCircleIcon,
  CheckCircleIcon: Icons.CheckCircleIcon,
  XCircleIcon: Icons.XCircleIcon,
  CalendarDaysIcon: Icons.CalendarDaysIcon,
  CalendarPlusIcon: Icons.CalendarPlusIcon,
  TimerIcon: Icons.TimerIcon,
  FilterIcon: Icons.FilterIcon,
  SortAscIcon: Icons.ArrowUpAZIcon,
  SortDescIcon: Icons.ArrowDownZAIcon,
  CopyIcon: Icons.CopyIcon,
  LinkIcon: Icons.LinkIcon,
  QrCodeIcon: Icons.QrCodeIcon,
  ScanIcon: Icons.ScanIcon,
  ZapIcon: Icons.ZapIcon,
  FlameIcon: Icons.FlameIcon,
  RocketIcon: Icons.RocketIcon,
  TrophyIcon: Icons.TrophyIcon,
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
      <Icon
        size={size === 'xs' ? 12 : size === 'sm' ? 14 : 20}
        className={`text-${color}-700`}
      />
    </div>
  );
}
