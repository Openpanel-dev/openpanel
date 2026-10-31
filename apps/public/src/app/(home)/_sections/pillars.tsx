import { Pillar } from '@/components/blocks/pillar';
import { ChatMock } from '@/components/dashboard-mock/chat';
import { VisualMock } from '@/components/visual-mock';

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
        visual={<VisualMock bleed="right" frame="inset" name="ai" />}
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
          <div className="bleed-left max-h-[600px] overflow-hidden rounded-3xl bg-neutral-100 px-6 pt-6 md:px-10 md:pt-10">
            <ChatMock className="rounded-b-none border-b-0" />
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
        visual={<VisualMock bleed="right" frame="inset" name="product" />}
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
          <VisualMock
            bleed="left"
            frame="inset"
            name="web-overview"
            side="bottom"
          />
        }
      />
    </div>
  );
}
