import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import { McpIllustration } from '@/components/illustrations/mcp';
import { Section, SectionLabel } from '@/components/section';

const tools = [
  'find_groups',
  'find_profiles',
  'get_analytics_overview',
  'get_country_breakdown',
  'get_dashboard_urls',
  'get_device_breakdown',
  'get_entry_exit_pages',
  'get_event_property_values',
  'get_funnel',
  'get_group',
  'get_page_conversions',
  'get_page_performance',
  'get_profile',
  'get_profile_metrics',
  'get_profile_sessions',
  'get_report_data',
  'get_retention_cohort',
  'get_rolling_active_users',
  'get_top_pages',
  'get_top_referrers',
  'get_user_flow',
  'get_user_last_seen_distribution',
  'get_weekly_retention_series',
  'gsc_get_cannibalization',
  'gsc_get_overview',
  'gsc_get_page_details',
  'gsc_get_query_details',
  'gsc_get_query_opportunities',
  'gsc_get_top_pages',
  'gsc_get_top_queries',
  'list_dashboards',
  'list_event_names',
  'list_event_properties',
  'list_group_types',
  'list_projects',
  'list_reports',
  'query_events',
  'query_sessions',
];

function ToolTicker() {
  // Duplicate for seamless loop
  const row = [...tools, ...tools];

  return (
    <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_15%,black_85%,transparent)]">
      <style>{`
        @keyframes ticker {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .ticker-track {
          animation: ticker 70s linear infinite;
        }
        .ticker-track:hover {
          animation-play-state: paused;
        }
      `}</style>
      <div className="ticker-track flex w-max gap-2">
        {row.map((tool, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static duplicate list
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5"
            key={i}
          >
            <span className="size-1.5 rounded-full bg-emerald-500" />
            <span className="font-mono text-[10px] text-muted-foreground">
              {tool}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Mcp() {
  return (
    <Section className="container">
      <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2 md:gap-16">
        {/* Left: copy */}
        <div className="col gap-6">
          <SectionLabel>AI-NATIVE ANALYTICS</SectionLabel>

          <h2 className="font-semibold text-3xl leading-[1.1] md:text-5xl">
            Ask your AI{' '}
            <span className="block text-muted-foreground">anything</span>
            about your users
          </h2>

          <p className="text-muted-foreground leading-relaxed">
            Connect Claude, Cursor, Windsurf, or your own AI agent to your
            OpenPanel data via MCP. No more tab-switching or building charts,
            your AI has the answers.
          </p>

          {/* Tool count + ticker */}
          <ToolTicker />

          {/* CTAs */}
          <div className="row items-center gap-4">
            <Link
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 font-semibold text-background text-sm transition-opacity hover:opacity-80"
              href="https://dashboard.openpanel.dev/onboarding"
            >
              Try it now
              <ArrowRightIcon className="size-3.5" />
            </Link>
            <Link
              className="row items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground"
              href="/docs/mcp#available-tools"
            >
              View all 38 tools <ArrowRightIcon className="size-3.5" />
            </Link>
          </div>
        </div>

        {/* Right: illustration */}
        <div className="group h-[420px]">
          <McpIllustration />
        </div>
      </div>
    </Section>
  );
}
