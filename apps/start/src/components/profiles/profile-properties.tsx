import { Widget } from '@/components/widget';
import { clipboard } from '@/utils/clipboard';
import { cn } from '@/utils/cn';
import { formatDateTime } from '@/utils/date';
import type { IServiceProfile } from '@openpanel/db';
import { CopyIcon } from 'lucide-react';
import { WidgetHead } from '../overview/overview-widget';

type Props = {
  profile: IServiceProfile;
};

// Property keys already surfaced above (as the header chips) — hidden from the
// raw properties list to avoid showing the same attribute twice.
const DEDUP_KEYS = ['country', 'city', 'device', 'os', 'browser', 'model'];

const LABELS: Record<string, string> = {
  id: 'ID',
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  createdAt: 'Created at',
};

function formatValue(value: unknown): string {
  if (value && typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export const ProfileProperties = ({ profile }: Props) => {
  const props = profile.properties ?? {};

  // `city` is only surfaced as a chip when `country` is present — only de-dup it
  // from the properties list in that case, otherwise it would be hidden entirely.
  const dedupKeys = props.country
    ? DEDUP_KEYS
    : DEDUP_KEYS.filter((key) => key !== 'city');

  // Profile params (the first-class profile columns) on top. `isExternal` is
  // omitted here — it's already shown as the Identified/Anonymous header badge.
  const profileItems = [
    { name: 'id', value: profile.id },
    { name: 'firstName', value: profile.firstName },
    { name: 'lastName', value: profile.lastName },
    { name: 'email', value: profile.email },
    {
      name: 'createdAt',
      value: profile.createdAt
        ? formatDateTime(new Date(profile.createdAt))
        : '',
    },
  ].filter(
    (it) => it.value !== undefined && it.value !== null && it.value !== '',
  );

  // Custom properties below, de-duplicated against what's already shown above.
  const propertyItems = Object.entries(props)
    .filter(
      ([key, value]) =>
        value !== undefined &&
        value !== null &&
        value !== '' &&
        !key.startsWith('__') &&
        !dedupKeys.includes(key),
    )
    .map(([key, value]) => ({ name: key, value: formatValue(value) }));

  return (
    <>
      <Widget className="w-full lg:shrink-0">
        <WidgetHead>
          <div className="title">Profile Information</div>
        </WidgetHead>
        <div className="flex flex-col">
          {profileItems.map((it) => (
            <Row
              key={it.name}
              label={LABELS[it.name] ?? it.name}
              value={String(it.value)}
            />
          ))}
        </div>
      </Widget>

      {propertyItems.length > 0 && (
        <Widget className="w-full lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
          <WidgetHead className="lg:shrink-0">
            <div className="title">Properties</div>
          </WidgetHead>
          <div className="flex flex-col lg:min-h-0 lg:flex-1 lg:overflow-auto">
            {propertyItems.map((it) => (
              <Row key={it.name} label={it.name} value={String(it.value)} />
            ))}
          </div>
        </Widget>
      )}
    </>
  );
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="group relative flex flex-col gap-1 border-t px-4 py-2.5 first:border-t-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="break-words pr-6 font-mono text-sm leading-snug">
        {value}
      </span>
      <button
        type="button"
        onClick={() => clipboard(value)}
        title="Copy"
        className={cn(
          'absolute right-3 top-3 text-muted-foreground opacity-0 transition-opacity',
          'hover:text-foreground group-hover:opacity-100',
        )}
      >
        <CopyIcon className="size-3" />
      </button>
    </div>
  );
}
