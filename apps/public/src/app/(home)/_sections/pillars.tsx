import { ArrowRightIcon, CheckIcon } from 'lucide-react';
import Link from 'next/link';
import { AiCostIllustration } from '@/components/illustrations/ai-cost';
import { AskAiIllustration } from '@/components/illustrations/ask-ai';
import { FunnelStepsIllustration } from '@/components/illustrations/funnel-steps';
import { VisitorsIllustration } from '@/components/illustrations/visitors';
import { SectionLabel } from '@/components/section';
import { cn } from '@/lib/utils';

interface PillarProps {
  id: string;
  label: string;
  title: string;
  description: string;
  points: string[];
  link: { href: string; text: string };
  illustration: React.ReactNode;
  reverse?: boolean;
}

function Pillar({
  id,
  label,
  title,
  description,
  points,
  link,
  illustration,
  reverse,
}: PillarProps) {
  return (
    <section
      className="container grid grid-cols-1 items-center gap-10 py-16 md:grid-cols-2 md:gap-16 md:py-24"
      id={id}
    >
      <div className={cn('col gap-6', reverse && 'md:order-2')}>
        <SectionLabel>{label}</SectionLabel>
        <h2 className="font-semibold text-3xl leading-tight tracking-tight md:text-4xl">
          {title}
        </h2>
        <p className="text-lg text-muted-foreground">{description}</p>
        <ul className="col gap-2.5">
          {points.map((point) => (
            <li className="row items-start gap-3" key={point}>
              <span className="center-center mt-0.5 size-5 shrink-0 rounded-full bg-blue-600/10 text-blue-700">
                <CheckIcon className="size-3" strokeWidth={3} />
              </span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
        <Link
          className="row w-fit items-center gap-1.5 font-medium transition-colors hover:text-blue-700"
          href={link.href}
        >
          {link.text}
          <ArrowRightIcon className="size-4" />
        </Link>
      </div>
      <div className={cn(reverse && 'md:order-1')}>{illustration}</div>
    </section>
  );
}

export function Pillars() {
  return (
    <div className="col">
      <Pillar
        description="Every model call your product makes shows up with its cost, tokens, latency and errors, tied to the user and session behind it. Find the feature that burns money and the prompt that fails, next to the rest of your analytics."
        id="ai-observability"
        illustration={<AiCostIllustration />}
        label="AI observability"
        link={{ href: '/docs/ai-observability', text: 'Read the docs' }}
        points={[
          'Cost per user, per feature and per model',
          'Traces for multi-step agents and tool calls',
          'One middleware for the Vercel AI SDK, or send events yourself',
        ]}
        title="Every AI call, with a price tag"
      />
      <Pillar
        description="Connect Claude, Cursor or your own agent to OpenPanel and ask in plain English. Which campaign brought paying users? Who churned after the pricing change? The answer comes back with the data behind it. You never have to open a dashboard if you don't want to."
        id="ask-your-ai"
        illustration={<AskAiIllustration />}
        label="Bring your own AI"
        link={{ href: '/docs/mcp', text: 'Connect your AI' }}
        points={[
          'Works with any MCP client',
          'Every report, funnel and profile is reachable',
          'Same permissions as your account, nothing more',
        ]}
        reverse
        title="Ask for the numbers instead of building charts"
      />
      <Pillar
        description="Track events from any app, then ask the questions that matter. Where do users drop off? Who comes back? Which plan converts? Funnels, retention, cohorts and profiles, with no limit on any of them."
        id="product-analytics"
        illustration={<FunnelStepsIllustration />}
        label="Product analytics"
        link={{ href: '/features', text: 'Explore product analytics' }}
        points={[
          'Funnels and conversion over time',
          'Retention and cohorts',
          'Profiles with the full history of each user',
        ]}
        title="Know what people do after they sign up"
      />
      <Pillar
        description="Visitors, referrers, pages, countries and devices, live. Cookie-less by default, so you do not need a consent banner, and light enough that nobody notices it."
        id="web-analytics"
        illustration={<VisitorsIllustration />}
        label="Web analytics"
        link={{ href: '/features/web-analytics', text: 'See web analytics' }}
        points={[
          'No cookies, no banner, GDPR compliant',
          'Realtime view of who is on your site now',
          'Google Search Console data in the same place',
        ]}
        reverse
        title="One script. The whole picture of your traffic."
      />
    </div>
  );
}
