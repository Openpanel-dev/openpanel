import { FeatureClosing, type FeaturePageProps } from './shared';
import { CardGrid } from '@/components/blocks/card-grid';
import { CodeSnippet } from '@/components/blocks/code-snippet';
import { FeatureHero } from '@/components/blocks/feature-hero';
import { Pillar } from '@/components/blocks/pillar';
import { StepsBand } from '@/components/blocks/steps-band';
import { VisualMock } from '@/components/visual-mock';

const INSTALL_LINES = [
  { text: 'npm install @openpanel/web', tone: 'muted' as const },
  { text: '' },
  { text: "import { OpenPanel } from '@openpanel/web';" },
  {
    text: "const op = new OpenPanel({ clientId: '…' });",
    tone: 'string' as const,
  },
];

const TRACK_LINES = [
  { text: "op.track('purchase', {" },
  { text: "  plan: 'pro',", tone: 'string' as const },
  { text: '  value: 29,' },
  { text: '});' },
];

export function EventTrackingPage({ data }: FeaturePageProps) {
  return (
    <>
      <FeatureHero
        description="One call per event, any properties you like. Watch them arrive live, click any value to filter, and use the same events in every funnel, retention grid and dashboard."
        title={data.hero.heading}
        visual={<VisualMock name="events" />}
      />
      <Pillar
        description="The events page listens while it is open. New events arrive at the top with a count, and the Stats tab turns the same stream into events over time, share of events and events by name."
        label="Live"
        points={[
          {
            title: 'A live stream in the table',
            text: 'The badge says Listening, then how many arrived. Click it to pull them in.',
          },
          {
            title: 'Stats without a report',
            text: 'Histogram, pie and bar for any event and date range, right in the tab.',
          },
          {
            title: 'One click to a filter',
            text: 'Any value in the table or the drawer becomes a filter when you click it.',
          },
        ]}
        title="Watch them arrive"
        visual={<VisualMock bleed="right" frame="inset" name="events-live" />}
      />
      <Pillar
        description="Open an event and you get the person, the session it belongs to, every property you sent and the context we added: path, referrer, device, city. Raw JSON is one tab away."
        label="Details"
        points={[
          {
            title: 'Your properties and ours',
            text: 'What you sent, plus path, referrer, OS, browser, brand, model, country and city.',
          },
          {
            title: 'Filter from the drawer',
            text: 'Every value has a filter icon. Click it and the list narrows to that value.',
          },
          {
            title: 'Pretty or raw',
            text: 'A readable layout by default, the JSON when you are debugging.',
          },
        ]}
        reverse
        title="Every event, in full"
        visual={<VisualMock frame="inset" name="event-drawer" side="bottom" />}
      />
      <Pillar
        description="Mark the events that matter as conversions, give them an icon and a colour, and group several names into one custom event with its own filters. Exclude your own traffic by IP, profile or rule."
        label="Settings"
        points={[
          {
            title: 'Conversions',
            text: 'One checkbox. Conversion events get their own tab and show up in the overview.',
          },
          {
            title: 'Custom events',
            text: 'Activation = project_created or invite_sent. Pick it in any report like a normal event.',
          },
          {
            title: 'Exclusions',
            text: 'IP addresses, profile ids and event rules that never count.',
          },
        ]}
        title="Name it once, use it everywhere"
        visual={
          <VisualMock bleed="right" frame="inset" name="event-settings" />
        }
      />
      <CardGrid
        description="Nothing is captured behind your back. Three things are automatic when you turn them on; everything else is a call you make."
        items={[
          {
            title: 'Screen views',
            description:
              'trackScreenViews follows pushState, replaceState and popstate in single-page apps.',
            visual: <VisualMock frame="bare" name="mini-screen-views" />,
          },
          {
            title: 'Outgoing links',
            description:
              'trackOutgoingLinks sends link_out with the href and the link text.',
            visual: <VisualMock frame="bare" name="mini-outgoing-links" />,
          },
          {
            title: 'data-track attributes',
            description:
              'A data-track attribute on any element becomes an event; other data-* attributes become its properties.',
            visual: <VisualMock frame="bare" name="mini-track-attributes" />,
          },
          {
            title: 'Revenue',
            description:
              'revenue(amount) sends a revenue event in cents that lands on the session and the profile.',
            visual: <VisualMock frame="bare" name="mini-revenue-call" />,
          },
          {
            title: 'AI calls',
            description:
              'ai() events carry model, tokens, cost and latency, and show in the same table.',
            visual: <VisualMock frame="bare" name="mini-ai-event" />,
          },
          {
            title: 'Eight packages',
            description:
              'Web, server, Next.js, Nuxt, Astro, Express, React Native and the AI middleware. Same event shape everywhere.',
            visual: <VisualMock frame="bare" name="mini-sdk-list" />,
          },
        ]}
        title="What is tracked, and how"
      />
      <StepsBand
        steps={[
          {
            title: 'Install',
            text: 'A script tag or an npm package, for the browser or the server.',
            visual: <CodeSnippet compact lines={INSTALL_LINES} />,
          },
          {
            title: 'Track',
            text: 'A name and an object. Properties can be strings, numbers, booleans or nested objects.',
            visual: <CodeSnippet compact lines={TRACK_LINES} />,
          },
          {
            title: 'See it, then use it',
            text: 'The event is in the live table within a second, and available to funnels, retention, charts and cohorts.',
          },
        ]}
        title="Three steps"
      />
      <FeatureClosing data={data} />
    </>
  );
}
