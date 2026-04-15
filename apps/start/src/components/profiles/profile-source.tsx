import { useSuspenseQuery } from '@tanstack/react-query';
import {
  Globe,
  Link as LinkIcon,
  Mail,
  Megaphone,
  Search,
  Share2,
  Video,
} from 'lucide-react';
import { useTRPC } from '@/integrations/trpc/react';
import { Widget } from '@/components/widget';
import { WidgetHead } from '@/components/overview/overview-widget';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { formatDateTime } from '@/utils/date';
import { classifySource, type SourceChannel } from '@/utils/source';

type Props = {
  profileId: string;
  projectId: string;
};

function ChannelIcon({ channel }: { channel: SourceChannel }) {
  const Icon =
    channel === 'paid-search' || channel === 'paid-social'
      ? Megaphone
      : channel === 'paid-video'
        ? Video
        : channel === 'organic-search'
          ? Search
          : channel === 'email'
            ? Mail
            : channel === 'organic-social'
              ? Share2
              : channel === 'referral'
                ? Globe
                : LinkIcon;
  return <Icon className="size-4 shrink-0 text-muted-foreground" />;
}

const CHANNEL_BADGE_CLASS: Record<SourceChannel, string> = {
  'paid-search': 'bg-blue-50 text-blue-700 border-blue-200',
  'paid-social': 'bg-purple-50 text-purple-700 border-purple-200',
  'paid-video': 'bg-pink-50 text-pink-700 border-pink-200',
  'organic-search': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'organic-social': 'bg-teal-50 text-teal-700 border-teal-200',
  email: 'bg-amber-50 text-amber-700 border-amber-200',
  referral: 'bg-slate-100 text-slate-700 border-slate-200',
  direct: 'bg-muted text-muted-foreground border-border',
};

function ChannelBadge({ channel }: { channel: SourceChannel }) {
  const readable =
    channel === 'paid-search'
      ? 'Paid search'
      : channel === 'paid-social'
        ? 'Paid social'
        : channel === 'paid-video'
          ? 'Paid video'
          : channel === 'organic-search'
            ? 'Organic search'
            : channel === 'organic-social'
              ? 'Organic social'
              : channel === 'email'
                ? 'Email'
                : channel === 'referral'
                  ? 'Referral'
                  : 'Direct';
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${CHANNEL_BADGE_CLASS[channel]}`}
    >
      {readable}
    </span>
  );
}

/**
 * "Source" card — shown on the profile detail page. Surfaces where the
 * profile originally arrived from (first session) plus every distinct
 * source they've used since, ranked by session count. This takes over
 * the acquisition-story UI job that used to live on the profile list
 * table (which had a tiny Referrer column).
 */
export function ProfileSource({ profileId, projectId }: Props) {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(
    trpc.profile.source.queryOptions({ profileId, projectId }),
  );

  const firstClassified = data.first ? classifySource(data.first) : null;

  // Collapse identical sources (the server already groups by the main
  // dimensions, but nothing stops you from having two separate distinct
  // tags that classify the same way). Keep the highest count.
  const ranked = data.sources
    .map((s) => ({ ...s, classified: classifySource(s) }))
    .sort((a, b) => b.count - a.count);

  return (
    <Widget className="w-full">
      <WidgetHead>
        <div className="title">Source</div>
      </WidgetHead>

      {firstClassified ? (
        <div className="border-b p-4">
          <div className="text-muted-foreground text-xs uppercase tracking-wide mb-2">
            First seen via
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <ChannelIcon channel={firstClassified.channel} />
            <span className="truncate font-medium">
              {firstClassified.platform ?? firstClassified.label}
            </span>
            <ChannelBadge channel={firstClassified.channel} />
          </div>
          {firstClassified.keyword ? (
            <div className="text-sm mt-1.5">
              Search term:{' '}
              <span className="font-mono">"{firstClassified.keyword}"</span>
            </div>
          ) : null}
          {firstClassified.campaign ? (
            <div className="text-sm text-muted-foreground mt-1">
              Campaign:{' '}
              <span className="font-mono">{firstClassified.campaign}</span>
            </div>
          ) : null}
          {data.first?.entryPath ? (
            <div className="text-sm text-muted-foreground mt-1">
              Landed on{' '}
              <span className="font-mono">{data.first.entryPath}</span>
            </div>
          ) : null}
          <div className="text-xs text-muted-foreground mt-1">
            {data.first?.createdAt
              ? formatDateTime(new Date(data.first.createdAt))
              : null}
          </div>
        </div>
      ) : (
        <div className="border-b p-4">
          <div className="text-muted-foreground text-xs uppercase tracking-wide mb-2">
            First seen via
          </div>
          <div className="flex items-center gap-2">
            <ChannelIcon channel="direct" />
            <span className="font-medium">Direct or untracked</span>
            <ChannelBadge channel="direct" />
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            No referrer or campaign data recorded for this profile yet.
          </div>
        </div>
      )}

      {ranked.length > 0 && (
        <div className="p-4">
          <div className="text-muted-foreground text-xs uppercase tracking-wide mb-2">
            All sources
          </div>
          <ul className="flex flex-col divide-y">
            {ranked.map((s, i) => (
              <li
                key={`${s.classified.label}-${i}`}
                className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <SerieIcon name={s.classified.platform ?? s.referrerName} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 truncate text-sm">
                      <span className="truncate">
                        {s.classified.platform ?? s.classified.label}
                      </span>
                      <ChannelBadge channel={s.classified.channel} />
                    </div>
                    {s.classified.campaign ? (
                      <div className="truncate text-xs text-muted-foreground">
                        Campaign:{' '}
                        <span className="font-mono">
                          {s.classified.campaign}
                        </span>
                      </div>
                    ) : null}
                    {s.classified.keyword ? (
                      <div className="truncate text-xs text-muted-foreground">
                        "{s.classified.keyword}"
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                  {s.count.toLocaleString()}{' '}
                  {s.count === 1 ? 'session' : 'sessions'}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Widget>
  );
}
