import { FeatureClosing, type FeaturePageProps } from './shared';
import { CardGrid } from '@/components/blocks/card-grid';
import { type CodeLine, CodeSnippet } from '@/components/blocks/code-snippet';
import { FeatureHero } from '@/components/blocks/feature-hero';
import { Pillar } from '@/components/blocks/pillar';
import { ProofStrip } from '@/components/blocks/proof-strip';
import { StepsBand } from '@/components/blocks/steps-band';
import { VisualMock } from '@/components/visual-mock';

const KULPINSKI_QUOTE = 3;

const SCRIPT_TAG: CodeLine[] = [
  { text: '<script' },
  { text: '  src="https://openpanel.dev/op1.js"', tone: 'string' },
  { text: '  data-client-id="YOUR_CLIENT_ID"', tone: 'string' },
  { text: '  data-track-screen-views="true"' },
  { text: '  data-track-outgoing-links="true"' },
  { text: '  defer' },
  { text: '></script>' },
];

export function WebAnalyticsPage({ data }: FeaturePageProps) {
  return (
    <>
      <FeatureHero
        description="Add one script and the overview fills itself: visitors, sources, pages, devices, countries and revenue. Click any value to filter the whole page. No cookies, so no banner."
        title={data.hero.heading}
        visual={<VisualMock name="web-overview" />}
      />
      <ProofStrip quote={KULPINSKI_QUOTE} />
      <Pillar
        description="Every row name on the overview is a filter. Click a referrer, a country or a page and the numbers, the chart and every widget show that slice only."
        label="Explore"
        points={[
          {
            title: 'Click to filter',
            text: 'Referrers, pages, countries, devices, campaigns: one click each.',
          },
          {
            title: 'A view is a link',
            text: 'Filters live in the URL, so you can send the exact view to a colleague.',
          },
          {
            title: 'Or just ask',
            text: 'The bar at the top understands "last 7 days, mobile only".',
          },
        ]}
        title="Click anything to filter"
        visual={<VisualMock bleed="right" frame="inset" name="web-filtered" />}
      />
      <Pillar
        description="Referrers, UTM campaigns and entry pages side by side, and a marker on the chart when one referrer suddenly sends more traffic than usual."
        label="Sources and campaigns"
        points={[
          {
            title: 'Every UTM parameter',
            text: 'Source, medium, campaign, term and content, next to referrers and types.',
          },
          {
            title: 'Entry and exit pages',
            text: 'Where visits start, where they end, and the bounce rate for each.',
          },
          {
            title: 'Spikes are marked',
            text: 'A referrer that jumps above its baseline gets a flag on the chart.',
          },
        ]}
        reverse
        title="Where traffic comes from"
        visual={<VisualMock bleed="left" frame="inset" name="web-sources" />}
      />
      <Pillar
        description="The realtime page is a map of the last 30 minutes: who is on the site, where they are, what they just did, and which referrers and countries send them."
        label="Realtime"
        points={[
          {
            title: 'Live sessions and events',
            text: 'Two feeds update every few seconds. Page views, sign-ups, link clicks.',
          },
          {
            title: 'Click a dot',
            text: 'Referrers, paths and recent sessions for that city.',
          },
          {
            title: 'Fullscreen',
            text: 'Made for the office TV.',
          },
        ]}
        title="Who is on the site right now"
        visual={<VisualMock bleed="right" frame="inset" name="realtime" />}
      />
      <CardGrid
        description="The overview has a widget for each question, and every one of them filters the rest."
        items={[
          {
            title: 'Devices',
            description:
              'Device type, browser and version, OS and version, brand and model.',
            visual: <VisualMock frame="bare" name="mini-devices" />,
          },
          {
            title: 'Countries, regions, cities',
            description:
              'A table and a map. Click a country to see the cities inside it.',
            visual: <VisualMock frame="bare" name="mini-map" />,
          },
          {
            title: 'Weekly trends',
            description:
              'Day of week by hour, for visitors, sessions, bounce rate or duration.',
            visual: <VisualMock frame="bare" name="mini-heatmap" />,
          },
          {
            title: 'User journey',
            description: 'Where people go after a page, drawn as a flow.',
            visual: <VisualMock frame="bare" name="mini-sankey" />,
          },
          {
            title: 'Revenue next to traffic',
            description:
              'A revenue metric on the overview, and a revenue column on sources and pages.',
            visual: <VisualMock frame="bare" name="mini-revenue" />,
          },
          {
            title: 'Search Console',
            description:
              'Clicks, impressions, CTR and position per page, plus AI assistant referrals.',
            visual: (
              <div className="pointer-events-none origin-top-left scale-[0.62]">
                <div className="col w-[460px] gap-3">
                  <VisualMock frame="bare" name="seo" />
                </div>
              </div>
            ),
          },
        ]}
        title="Everything else on the overview"
      />
      <StepsBand
        description="No configuration, no tag manager, no consent banner."
        steps={[
          {
            title: 'Paste the script',
            text: 'One tag in the head of your site, or the npm package in your app.',
            visual: <CodeSnippet compact lines={SCRIPT_TAG} />,
          },
          {
            title: 'The overview fills in',
            text: 'The first visitors show up within a minute, live counter included.',
            visual: (
              <div className="surface p-4">
                <VisualMock frame="bare" name="mini-realtime" />
              </div>
            ),
          },
          {
            title: 'Share it',
            text: 'A public link to the overview, with a password if you want one.',
            visual: (
              <div className="surface p-4">
                <VisualMock frame="bare" name="mini-share-toggle" />
              </div>
            ),
          },
        ]}
        title="Two minutes from script to dashboard"
      />
      <FeatureClosing data={data} />
    </>
  );
}
