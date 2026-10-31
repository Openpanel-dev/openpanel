import { FeatureClosing, type FeaturePageProps } from './shared';
import { CardGrid } from '@/components/blocks/card-grid';
import { type CodeLine, CodeSnippet } from '@/components/blocks/code-snippet';
import { FeatureHero } from '@/components/blocks/feature-hero';
import { Pillar } from '@/components/blocks/pillar';
import { ProofStrip } from '@/components/blocks/proof-strip';
import { StepsBand } from '@/components/blocks/steps-band';
import { VisualMock } from '@/components/visual-mock';

const TRACK_CALL: CodeLine[] = [
  { text: "op.track('sign_up', {" },
  { text: "  plan: 'pro',", tone: 'string' },
  { text: "  source: 'pricing_page',", tone: 'string' },
  { text: '});' },
];

export function DataVisualizationPage({ data }: FeaturePageProps) {
  return (
    <>
      <FeatureHero
        description="Eleven chart types, one builder. Pick the events, add a breakdown or a formula, and pin the result to a dashboard the whole team can open."
        title={data.hero.heading}
        visual={<VisualMock name="report-editor" />}
      />
      <ProofStrip
        stats={[
          { value: '11', label: 'chart types in one builder' },
          { value: '26', label: 'series per report, A to Z, with formulas' },
          { value: '24', label: 'columns on a dashboard grid' },
        ]}
      />
      <Pillar
        description="Lines, bars, histograms, pies, metrics, areas, maps, funnels, retention, conversion and sankeys come out of the same report builder, from the same events."
        label="Reports"
        points={[
          {
            title: 'Eleven chart types',
            text: 'Switch the type and keep the metrics, filters and breakdowns.',
          },
          {
            title: 'Any metric',
            text: 'Unique users or sessions, sums, averages, medians, 95th and 99th percentiles.',
          },
          {
            title: 'Formulas across series',
            text: 'B / A for a rate, A - B for a difference, and hide the source series.',
          },
        ]}
        title="One builder for everything"
        visual={<VisualMock bleed="right" frame="inset" name="chart-types" />}
      />
      <Pillar
        description="A dashboard is a grid of saved reports. Drag and resize the tiles, give the whole board one date range, and share it as a link."
        label="Dashboards"
        points={[
          {
            title: 'Drag and resize',
            text: 'A 24-column grid. Metric tiles small, charts wide, tables tall.',
          },
          {
            title: 'One range for the board',
            text: 'Override every tile at once; a tile can keep its own.',
          },
          {
            title: 'Chart or table per tile',
            text: 'Flip any tile to its numbers, duplicate it, or move it to another board.',
          },
        ]}
        reverse
        title="Pin it to a dashboard"
        visual={<VisualMock bleed="left" frame="inset" name="dashboard" />}
      />
      <Pillar
        description="Some questions are not a line. A sankey shows where people go after a page, a map shows where they are, a histogram shows how a value is spread."
        label="Beyond lines"
        points={[
          {
            title: 'Sankey between any events',
            text: 'After, before or between two events, two to ten steps.',
          },
          {
            title: 'Map by country',
            text: 'Any metric on a world map.',
          },
          {
            title: 'Stacked histograms',
            text: 'Distribution of a property, series stacked.',
          },
        ]}
        title="Flows, maps and histograms too"
        visual={<VisualMock frame="inset" name="sankey" side="bottom" />}
      />
      <CardGrid
        description="The small things that make a report worth saving."
        items={[
          {
            title: 'Formulas',
            description:
              'Combine series with arithmetic: a rate, a ratio, a difference.',
            visual: <VisualMock frame="bare" name="mini-formula" />,
          },
          {
            title: 'Compare to previous period',
            description:
              'One toggle. The previous period draws behind the current one.',
            visual: <VisualMock frame="bare" name="mini-trend" />,
          },
          {
            title: 'Ask for a report',
            description:
              'Describe the chart you want and the builder fills itself in.',
            visual: <VisualMock frame="bare" name="mini-ai-prompt" />,
          },
          {
            title: 'Badges and counters',
            description:
              'A live visitor counter or a 30-day badge for your own site.',
            visual: <VisualMock frame="bare" name="mini-widget" />,
          },
          {
            title: 'Share and export',
            description:
              'A public link per report or dashboard, with an optional password. The table exports to CSV.',
            visual: <VisualMock frame="bare" name="mini-share-toggle" />,
          },
          {
            title: 'Funnels and retention',
            description:
              'Both are chart types in the same builder, not separate tools.',
            visual: <VisualMock frame="bare" name="mini-funnel" />,
          },
        ]}
        title="Built into every report"
      />
      <StepsBand
        description="No SQL and no data team. If you track the events, you can chart them."
        steps={[
          {
            title: 'Track events',
            text: 'One call per event, with whatever properties you want to break down by.',
            visual: <CodeSnippet compact lines={TRACK_CALL} />,
          },
          {
            title: 'Build the report',
            text: 'Pick a chart type, the events, a breakdown. Add a formula if you need a rate.',
            visual: (
              <div className="surface p-4">
                <VisualMock frame="bare" name="mini-formula" />
              </div>
            ),
          },
          {
            title: 'Pin and share',
            text: 'Save it to a dashboard, share the link, or embed a counter on your site.',
            visual: (
              <div className="surface p-4">
                <VisualMock frame="bare" name="mini-widget" />
              </div>
            ),
          },
        ]}
        title="From events to a dashboard"
      />
      <FeatureClosing data={data} />
    </>
  );
}
