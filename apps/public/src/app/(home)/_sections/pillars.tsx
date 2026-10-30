import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import { AiOverviewContent } from '@/components/dashboard-mock/ai-overview';
import { ChatMock } from '@/components/dashboard-mock/chat';
import {
  FunnelContent,
  RetentionContent,
} from '@/components/dashboard-mock/product-analytics';
import { WebOverviewContent } from '@/components/dashboard-mock/web-overview';
import { SectionLabel } from '@/components/section';
import { cn } from '@/lib/utils';

interface PillarProps {
  id: string;
  label: string;
  title: string;
  description: string;
  points: { title: string; text: string }[];
  link: { href: string; text: string };
  visual: React.ReactNode;
  reverse?: boolean;
}

// A piece of the dashboard, cut off at the panel edge like a window into the product.
function Inset({
  children,
  className,
  width = 760,
  side = 'right',
}: {
  children: React.ReactNode;
  className?: string;
  width?: number;
  side?: 'right' | 'bottom';
}) {
  const cutBottom = side === 'bottom';
  return (
    <div
      aria-hidden
      className={cn(
        'relative overflow-hidden rounded-3xl bg-neutral-100 pt-8 md:pt-12',
        cutBottom ? 'px-6 md:px-8' : 'pl-8 md:pl-12',
        className
      )}
    >
      <div
        className={cn(
          'col shrink-0 gap-3 border-neutral-200 border-t bg-neutral-50/60 p-4 text-left text-neutral-900 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.2)]',
          cutBottom ? 'rounded-t-xl border-x' : 'rounded-tl-xl border-l'
        )}
        style={cutBottom ? undefined : { width }}
      >
        {children}
      </div>
    </div>
  );
}

function Pillar({
  id,
  label,
  title,
  description,
  points,
  link,
  visual,
  reverse,
}: PillarProps) {
  return (
    <section
      className="container grid grid-cols-1 items-center gap-10 py-14 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-14 md:py-20"
      id={id}
    >
      <div className={cn('col gap-6', reverse && 'md:order-2')}>
        <SectionLabel>{label}</SectionLabel>
        <h2 className="text-balance font-semibold text-3xl leading-[1.1] tracking-[-0.02em] md:text-4xl">
          {title}
        </h2>
        <p className="text-lg text-neutral-600">{description}</p>
        <dl className="col gap-4 border-neutral-200 border-t pt-5">
          {points.map((point) => (
            <div className="col gap-0.5" key={point.title}>
              <dt className="font-medium">{point.title}</dt>
              <dd className="text-neutral-600 text-sm">{point.text}</dd>
            </div>
          ))}
        </dl>
        <Link
          className="row w-fit items-center gap-1.5 font-medium transition-colors hover:text-blue-700"
          href={link.href}
        >
          {link.text}
          <ArrowRightIcon className="size-4" />
        </Link>
      </div>
      <div className={cn('min-w-0', reverse && 'md:order-1')}>{visual}</div>
    </section>
  );
}

export function Pillars() {
  return (
    <div className="col py-6">
      <Pillar
        description="Every model call your product makes shows up with its cost, tokens, latency and errors, tied to the user and session behind it. The feature that burns money and the prompt that fails are one click away from the rest of your analytics."
        id="ai-observability"
        label="AI observability"
        link={{ href: '/docs/ai-observability', text: 'Read the docs' }}
        points={[
          {
            title: 'Cost per user, feature and model',
            text: 'Know what a customer costs you before the invoice arrives.',
          },
          {
            title: 'Traces for agents',
            text: 'Multi-step chains and tool calls, laid out step by step.',
          },
          {
            title: 'One middleware',
            text: 'Wrap the Vercel AI SDK once, or send the events yourself.',
          },
        ]}
        title="Every AI call, with a price tag"
        visual={
          <Inset className="max-h-[520px]" width={820}>
            <AiOverviewContent />
          </Inset>
        }
      />
      <Pillar
        description="Connect Claude, Cursor or your own agent to OpenPanel and ask in plain English. Which campaign brought paying users? Who churned after the pricing change? The answer comes back with the data behind it. You never have to open a dashboard if you don't want to."
        id="ask-your-ai"
        label="Bring your own AI"
        link={{ href: '/docs/mcp', text: 'Connect your AI' }}
        points={[
          {
            title: 'Works with any MCP client',
            text: 'Claude, Cursor, Windsurf, or an agent you wrote yourself.',
          },
          {
            title: 'Everything is reachable',
            text: 'Reports, funnels, retention, profiles and sessions.',
          },
          {
            title: 'Your permissions, nothing more',
            text: 'The AI sees what your account sees.',
          },
        ]}
        reverse
        title="Ask for the numbers instead of building charts"
        visual={
          <div className="rounded-3xl bg-neutral-100 p-6 md:p-10">
            <ChatMock />
          </div>
        }
      />
      <Pillar
        description="Track events from any app, then ask the questions that matter. Where do users drop off? Who comes back? Which plan converts? Funnels, retention, cohorts and profiles, with no limit on any of them."
        id="product-analytics"
        label="Product analytics"
        link={{ href: '/features', text: 'Explore product analytics' }}
        points={[
          {
            title: 'Funnels and conversion',
            text: 'Any events, any breakdown, and how it changes over time.',
          },
          {
            title: 'Retention and cohorts',
            text: 'Who comes back, grouped by when they joined or what they did.',
          },
          {
            title: 'Profiles',
            text: 'The full history of every user, with their sessions and events.',
          },
        ]}
        title="Know what people do after they sign up"
        visual={
          <Inset className="max-h-[520px]" width={820}>
            <FunnelContent />
            <RetentionContent compact />
          </Inset>
        }
      />
      <Pillar
        description="Visitors, referrers, pages, countries and devices, live. Cookie-less by default, so you do not need a consent banner, and light enough that nobody notices it."
        id="web-analytics"
        label="Web analytics"
        link={{ href: '/features/web-analytics', text: 'See web analytics' }}
        points={[
          {
            title: 'No cookies, no banner',
            text: 'GDPR compliant out of the box.',
          },
          {
            title: 'Realtime',
            text: 'Who is on the site now and where they came from.',
          },
          {
            title: 'Search Console built in',
            text: 'Queries and clicks next to the pages they land on.',
          },
        ]}
        reverse
        title="One script. The whole picture of your traffic."
        visual={
          <Inset className="max-h-[520px]" side="bottom">
            <WebOverviewContent compact />
          </Inset>
        }
      />
    </div>
  );
}
