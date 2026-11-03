import {
  ChevronDownIcon,
  MaximizeIcon,
  PauseIcon,
  PlayIcon,
  XIcon,
} from 'lucide-react';
import { Pill } from './primitives';
import { cn } from '@/lib/utils';

// Forms, sheets, modals and players: the chrome around the data views.

// A right-hand side sheet with a title, as the report builder, rule editor
// and event drawer use.
export function MockSheet({
  title,
  description,
  children,
  footer,
  className,
  width = 360,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  width?: number;
}) {
  return (
    <div
      className={cn(
        'col shrink-0 overflow-hidden rounded-xl border border-neutral-200 bg-white text-left shadow-[0_20px_50px_-20px_rgba(0,0,0,0.25)]',
        className
      )}
      style={{ width }}
    >
      <div className="row items-start justify-between border-neutral-200 border-b px-4 py-3">
        <div className="col">
          <span className="font-medium text-[13px]">{title}</span>
          {description && (
            <span className="text-[11px] text-neutral-500">{description}</span>
          )}
        </div>
        <XIcon className="size-3.5 text-neutral-400" />
      </div>
      <div className="col gap-4 p-4">{children}</div>
      {footer && (
        <div className="row justify-end gap-2 border-neutral-200 border-t px-4 py-3">
          {footer}
        </div>
      )}
    </div>
  );
}

// The dashboard's two-layer modal: a grey shell with the actions, and a
// white card inside with the content.
export function MockModal({
  title,
  description,
  children,
  actions,
  className,
  width = 440,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  width?: number;
}) {
  return (
    <div
      className={cn(
        'col gap-3 rounded-2xl bg-neutral-100 p-2 text-left shadow-[0_30px_60px_-24px_rgba(0,0,0,0.3)] ring-1 ring-black/6',
        className
      )}
      style={{ width }}
    >
      <div className="col gap-4 rounded-xl border border-neutral-200 bg-white p-4">
        <div className="col gap-0.5">
          <span className="font-medium text-[13px]">{title}</span>
          {description && (
            <span className="text-[11.5px] text-neutral-500">
              {description}
            </span>
          )}
        </div>
        {children}
      </div>
      {actions && (
        <div className="row justify-end gap-2 px-2 pb-1">{actions}</div>
      )}
    </div>
  );
}

export function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="col gap-1.5 text-[12px]">
      <span className="font-medium text-neutral-700">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-neutral-500">{hint}</span>}
    </label>
  );
}

// Filled, borderless inputs, as the dashboard's forms look.
export function FormInput({
  value,
  placeholder,
  mono = false,
  className,
}: {
  value?: string;
  placeholder?: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'row h-8 items-center rounded-md bg-neutral-100 px-2.5 text-[12px]',
        value ? 'text-neutral-900' : 'text-neutral-400',
        mono && 'font-mono',
        className
      )}
    >
      {value ?? placeholder}
    </span>
  );
}

export function FormSelect({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'row h-8 items-center justify-between rounded-md bg-neutral-100 px-2.5 text-[12px] text-neutral-900',
        className
      )}
    >
      {value}
      <ChevronDownIcon className="size-3.5 text-neutral-400" />
    </span>
  );
}

export function FormTextarea({
  value,
  rows = 3,
}: {
  value: string;
  rows?: number;
}) {
  return (
    <span
      className="block whitespace-pre-wrap rounded-md bg-neutral-100 px-2.5 py-2 font-mono text-[11.5px] text-neutral-900"
      style={{ minHeight: rows * 18 + 16 }}
    >
      {value}
    </span>
  );
}

export function MockButton({
  children,
  primary = false,
  className,
}: {
  children: React.ReactNode;
  primary?: boolean;
  className?: string;
}) {
  return (
    <Pill active={primary} className={cn('font-medium', className)}>
      {children}
    </Pill>
  );
}

// Pills that act as one choice, like "Session | Profile" or "Events | Funnel".
export function SegmentedControl({
  items,
  active = 0,
}: {
  items: string[];
  active?: number;
}) {
  return (
    <span className="row rounded-md bg-neutral-100 p-0.5 text-[11.5px]">
      {items.map((item, index) => (
        <span
          className={cn(
            'rounded px-2.5 py-1',
            index === active
              ? 'bg-white font-medium shadow-sm'
              : 'text-neutral-500'
          )}
          key={item}
        >
          {item}
        </span>
      ))}
    </span>
  );
}

// A vertical list of events with a time rail: session detail, profile
// activity, notification history.
export function Timeline({
  items,
  className,
}: {
  items: {
    label: string;
    detail?: string;
    time: string;
    icon?: React.ReactNode;
    muted?: boolean;
    highlight?: boolean;
  }[];
  className?: string;
}) {
  return (
    <ol className={cn('col', className)}>
      {items.map((item, index) => (
        <li
          className={cn(
            'row items-center gap-3 border-neutral-100 border-b px-3 py-2 text-[12px] last:border-b-0',
            item.muted && 'opacity-50',
            item.highlight && 'bg-blue-50/60'
          )}
          // biome-ignore lint/suspicious/noArrayIndexKey: static rows with repeated names
          key={index}
        >
          <span className="center-center size-5 shrink-0 rounded-md bg-neutral-100 text-neutral-600">
            {item.icon ?? (
              <span className="size-1.5 rounded-full bg-blue-600" />
            )}
          </span>
          <span className="font-mono">{item.label}</span>
          {item.detail && (
            <span className="truncate text-neutral-500">{item.detail}</span>
          )}
          <span className="ml-auto whitespace-nowrap font-mono text-[11px] text-neutral-500">
            {item.time}
          </span>
        </li>
      ))}
    </ol>
  );
}

// The replay scrubber: play/pause, time, a track with event ticks.
export function PlayerBar({
  current = '01:24',
  total = '04:10',
  progress = 33,
  ticks = [8, 14, 15, 16, 31, 52, 70, 88],
  playing = false,
  className,
}: {
  current?: string;
  total?: string;
  progress?: number;
  ticks?: number[];
  playing?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'row items-center gap-3 text-[11px] text-neutral-600',
        className
      )}
    >
      <span className="center-center size-6 rounded-md bg-neutral-900 text-white">
        {playing ? (
          <PauseIcon className="size-3 fill-current" />
        ) : (
          <PlayIcon className="size-3 fill-current" />
        )}
      </span>
      <span className="font-mono">{current}</span>
      <div className="relative h-1.5 flex-1 rounded-full bg-neutral-200">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-blue-600"
          style={{ width: `${progress}%` }}
        />
        {ticks.map((tick) => (
          <span
            className="absolute -top-1 size-3.5 rounded-sm border border-white bg-neutral-900"
            key={tick}
            style={{ left: `calc(${tick}% - 7px)` }}
          />
        ))}
        <span
          className="absolute -top-1 size-3.5 rounded-full border-2 border-white bg-blue-600 shadow"
          style={{ left: `calc(${progress}% - 7px)` }}
        />
      </div>
      <span className="font-mono">{total}</span>
      <MaximizeIcon className="size-3.5 text-neutral-400" />
    </div>
  );
}

// The frame the replay player draws around a recording: a URL bar and a
// time counter. The only place a fake browser bar is allowed, because the
// real player has one.
export function BrowserFrame({
  url,
  time,
  children,
  className,
}: {
  url: string;
  time?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'col overflow-hidden rounded-lg border border-neutral-200 bg-white',
        className
      )}
    >
      <div className="row items-center gap-3 border-neutral-200 border-b bg-neutral-50 px-3 py-1.5">
        <span className="row gap-1">
          <span className="size-2 rounded-full bg-neutral-300" />
          <span className="size-2 rounded-full bg-neutral-300" />
          <span className="size-2 rounded-full bg-neutral-300" />
        </span>
        <span className="flex-1 truncate rounded bg-white px-2 py-0.5 font-mono text-[10.5px] text-neutral-600 ring-1 ring-black/6">
          {url}
        </span>
        {time && (
          <span className="font-mono text-[10.5px] text-neutral-500">
            {time}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// A wireframe of a recorded page: grey text bars, a masked input, a button.
export function RecordedPage({
  masked = true,
  className,
}: {
  masked?: boolean;
  className?: string;
}) {
  const text = masked ? '**** ******* ****' : 'Create your account';
  return (
    <div className={cn('relative h-40 bg-white p-4 text-[11px]', className)}>
      <div className="col max-w-[260px] gap-2.5">
        <span className="font-mono font-semibold text-[13px]">{text}</span>
        <span className="h-2 w-40 rounded bg-neutral-200" />
        <span className="h-2 w-52 rounded bg-neutral-200" />
        <span className="row h-7 items-center rounded-md bg-neutral-100 px-2 font-mono text-neutral-400">
          {masked ? '••••••••••' : 'ada@example.com'}
        </span>
        <span className="row h-7 w-24 items-center justify-center rounded-md bg-neutral-900 font-medium text-white">
          {masked ? '****' : 'Sign up'}
        </span>
      </div>
    </div>
  );
}
