import type { IServiceEvent, IServiceProfile } from '@openpanel/db';
import { useQuery } from '@tanstack/react-query';
import { KeyValueGrid } from '@/components/ui/key-value-grid';
import { useTRPC } from '@/integrations/trpc/react';
import { Widget } from '@/components/widget';
import { formatDateTime } from '@/utils/date';
import { FullPageEmptyState } from '../full-page-empty-state';
import { WidgetHead } from '../overview/overview-widget';

type Props = {
  profile: IServiceProfile;
};

/**
 * Properties hidden from the unified Profile Information grid. They
 * either live in their own card (referrer → Source, os/device/model →
 * Platforms), are too granular to help decide anything (browser,
 * browser_version, individual page path) or are long free-text blobs
 * that don't fit in a grid cell (biography, bio, description). Raw
 * values remain in ClickHouse for anyone who needs them.
 */
const NOISY_PROPERTY_KEYS = new Set([
  'browser',
  'browser_version',
  'path',
  'referrer',
  'referrer_name',
  'referrer_type',
  '__referrer',
  '__query',
  '__version',
  '__buildNumber',
  'os',
  'os_version',
  'device',
  'brand',
  'model',
  'biography',
  'bio',
  'description',
]);

/** Drop any string value longer than this — grid cells can't
 *  reasonably display paragraphs. */
const MAX_VALUE_LENGTH = 120;

export const ProfileProperties = ({ profile }: Props) => {
  const trpc = useTRPC();

  // Resolve the profile's group IDs into readable names so we can
  // surface the team inline (rather than only as pill badges).
  const groupsQuery = useQuery(
    trpc.group.listByIds.queryOptions(
      {
        projectId: profile.projectId,
        ids: profile.groups ?? [],
      },
      {
        enabled: (profile.groups?.length ?? 0) > 0,
      },
    ),
  );

  const team =
    groupsQuery.data?.find((g) => g.type?.toLowerCase() === 'team') ??
    groupsQuery.data?.[0] ??
    null;

  const isSubscriber =
    profile.properties.is_subscriber === true ||
    profile.properties.is_subscriber === 'true' ||
    profile.properties.is_subscriber === '1';
  const plan = (profile.properties.plan as string | undefined)?.trim();

  // Anything Pin Drop (or any user) sets on `identify()` that isn't in
  // the hidden list already and isn't one of the "first-class" fields
  // we render explicitly above.
  const FIRST_CLASS_KEYS = new Set([
    'country',
    'city',
    'region',
    'timezone',
    'locale',
    'language',
    'plan',
    'is_subscriber',
  ]);
  const customProperties = Object.entries(profile.properties)
    .filter(([key, value]) => {
      if (value === undefined || value === null || value === '') return false;
      if (NOISY_PROPERTY_KEYS.has(key)) return false;
      if (FIRST_CLASS_KEYS.has(key)) return false;
      if (typeof value === 'string' && value.length > MAX_VALUE_LENGTH) {
        return false;
      }
      return true;
    })
    .map(([key, value]) => ({
      name: key,
      value,
      event: {
        ...profile,
        ...profile.properties,
      } as unknown as IServiceEvent,
    }));

  // Combine country + city into a single "Location" row, e.g. "London,
  // GB". Falls back to either if only one is available.
  const city = (profile.properties.city as string | undefined)?.trim();
  const country = (profile.properties.country as string | undefined)?.trim();
  const locationValue =
    city && country ? `${city}, ${country}` : city || country || null;

  const data: Array<{
    name: string;
    value: unknown;
    event?: IServiceEvent;
  }> = [
    // Order here matches the product spec:
    // First name → Last name → Email → Is Subscriber → Plan →
    // Team Name → ID → Created at → Location (+ any other custom
    // properties Pin Drop has set via `identify`).
    { name: 'firstName', value: profile.firstName || 'N/A' },
    { name: 'lastName', value: profile.lastName || 'N/A' },
    { name: 'email', value: profile.email || 'N/A' },
    { name: 'isSubscriber', value: isSubscriber ? 'Yes' : 'No' },
    { name: 'plan', value: plan || (isSubscriber ? 'subscriber' : 'free') },
    { name: 'teamName', value: team?.name ?? 'N/A' },
    { name: 'id', value: profile.id },
    {
      name: 'createdAt',
      value: formatDateTime(new Date(profile.createdAt)),
    },
    // Users travel, so this is "last known" — taken from the most
    // recent event. We're not promising it's where they live.
    ...(locationValue
      ? [{ name: 'lastKnownLocation', value: locationValue }]
      : [{ name: 'lastKnownLocation', value: 'N/A' }]),
    ...(profile.properties.timezone
      ? [{ name: 'timezone', value: profile.properties.timezone }]
      : []),
    ...((profile.properties.locale || profile.properties.language)
      ? [
          {
            name: 'locale',
            value:
              (profile.properties.locale as string) ??
              (profile.properties.language as string),
          },
        ]
      : []),
    ...customProperties,
  ].map((item) => ({
    ...item,
    event: {
      ...profile,
      ...profile.properties,
    } as unknown as IServiceEvent,
  }));

  return (
    <Widget className="w-full">
      <WidgetHead>
        <div className="title">Profile Information</div>
      </WidgetHead>

      {profile ? (
        <KeyValueGrid
          copyable
          className="border-0"
          columns={3}
          data={data}
        />
      ) : (
        <FullPageEmptyState title="No profile data" />
      )}
    </Widget>
  );
};
