import type { IServiceEvent, IServiceSession } from '@openpanel/core';
import { parseAsStringEnum, useQueryState } from 'nuqs';
import {
  WidgetButtons,
  WidgetHead,
} from '@/components/overview/overview-widget';
import {
  KeyValueGrid,
  type KeyValueItem,
} from '@/components/ui/key-value-grid';
import { Widget } from '@/components/widget';
import { fancyMinutes } from '@/hooks/use-numer-formatter';
import { cn } from '@/utils/cn';

const TABS = [
  { key: 'session', label: 'Session' },
  { key: 'source', label: 'Source' },
  { key: 'device', label: 'Device' },
] as const;
type TabKey = (typeof TABS)[number]['key'];
const MS_PER_SECOND = 1000;

/** Lets the grid's filter links treat session fields like event properties. */
function sessionAsEvent(session: IServiceSession): IServiceEvent {
  return {
    ...session,
    name: 'screen_view',
    sessionId: session.id,
    properties: {},
    path: session.exitPath,
    origin: session.exitOrigin,
    importedAt: undefined,
    meta: undefined,
    sdkName: undefined,
    sdkVersion: undefined,
    profile: undefined,
  };
}

function withVersion(name: string, version: string): string {
  return version ? `${name} ${version}` : name;
}

function getItems(session: IServiceSession, tab: TabKey): KeyValueItem[] {
  const event = sessionAsEvent(session);
  const items: Record<TabKey, KeyValueItem[]> = {
    session: [
      { name: 'id', value: session.id },
      { name: 'createdAt', value: session.createdAt },
      { name: 'endedAt', value: session.endedAt },
      {
        name: 'duration',
        value: fancyMinutes(session.duration / MS_PER_SECOND),
      },
      { name: 'entryPath', value: session.entryPath },
      { name: 'exitPath', value: session.exitPath },
      { name: 'bounce', value: session.isBounce ? 'Yes' : 'No' },
      { name: 'deviceId', value: session.deviceId },
    ],
    source: [
      { name: 'referrerName', value: session.referrerName, event },
      { name: 'referrerType', value: session.referrerType, event },
      { name: 'referrer', value: session.referrer, event },
      { name: 'utmSource', value: session.utmSource },
      { name: 'utmMedium', value: session.utmMedium },
      { name: 'utmCampaign', value: session.utmCampaign },
      { name: 'utmContent', value: session.utmContent },
      { name: 'utmTerm', value: session.utmTerm },
    ],
    device: [
      { name: 'country', value: session.country, event },
      { name: 'region', value: session.region, event },
      { name: 'city', value: session.city, event },
      { name: 'device', value: session.device, event },
      { name: 'os', value: withVersion(session.os, session.osVersion) },
      {
        name: 'browser',
        value: withVersion(session.browser, session.browserVersion),
      },
      { name: 'brand', value: session.brand, event },
      { name: 'model', value: session.model, event },
    ],
  };
  return items[tab].filter(
    (item) =>
      item.value !== '' && item.value !== null && item.value !== undefined
  );
}

export function SessionProperties({ session }: { session: IServiceSession }) {
  const [tab, setTab] = useQueryState(
    'tab',
    parseAsStringEnum(TABS.map((t) => t.key)).withDefault('session')
  );
  const items = getItems(session, tab);

  return (
    <Widget className="w-full">
      <WidgetHead>
        <div className="title">Details</div>
        <WidgetButtons>
          {TABS.map((t) => (
            <button
              className={cn(t.key === tab && 'active')}
              key={t.key}
              onClick={() => setTab(t.key)}
              type="button"
            >
              {t.label}
            </button>
          ))}
        </WidgetButtons>
      </WidgetHead>
      {items.length > 0 ? (
        <KeyValueGrid className="border-0" columns={1} copyable data={items} />
      ) : (
        <div className="p-4 text-muted-foreground text-sm">
          Nothing recorded for this session.
        </div>
      )}
    </Widget>
  );
}
