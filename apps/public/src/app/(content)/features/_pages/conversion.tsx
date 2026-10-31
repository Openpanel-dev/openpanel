import { FeatureClosing, type FeaturePageProps } from './shared';
import { CardGrid } from '@/components/blocks/card-grid';
import { CodeSnippet } from '@/components/blocks/code-snippet';
import { CompareRow } from '@/components/blocks/compare-row';
import { FeatureHero } from '@/components/blocks/feature-hero';
import { Pillar } from '@/components/blocks/pillar';
import { StepsBand } from '@/components/blocks/steps-band';
import { MiniFunnel } from '@/components/dashboard-mock/minis';
import {
  MiniCohortFilter,
  MiniCompare,
  MiniFunnelToggle,
  MiniFunnelWindow,
} from '@/components/dashboard-mock/product-analytics';
import {
  MiniConversionFlag,
  MiniInterval,
  RateChart,
} from '@/components/dashboard-mock/product-conversion';
import { VisualMock } from '@/components/visual-mock';

const TRACK_CODE = [
  { text: "op.track('sign_up', {", tone: 'keyword' as const },
  { text: "  variant: 'pricing-b',", tone: 'string' as const },
  { text: '});' },
  { text: '' },
  { text: "op.track('purchase');" },
];

export function ConversionPage({ data }: FeaturePageProps) {
  return (
    <>
      <FeatureHero
        description="Two events, a rate per day, week or month, and a line you can watch. Break it down by plan, country or campaign to see which one moved."
        title={data.hero.heading}
        visual={<VisualMock name="conversion" />}
      />
      <CompareRow
        description="Same events, two questions. A funnel shows where people stop in a sequence. A conversion report shows whether the rate from one event to another is going up or down."
        items={[
          {
            label: 'Funnel: where do they stop?',
            caption: 'Five steps, one snapshot, drop-off per step.',
            visual: <MiniFunnel />,
          },
          {
            label: 'Conversion: is it getting better?',
            caption: 'Two events, a rate per period, a trend.',
            visual: (
              <RateChart
                average={31}
                height={96}
                series={[
                  { values: [24, 27, 30, 31, 35, 38, 36], colour: '#2563eb' },
                ]}
              />
            ),
          },
        ]}
        title="Funnel or conversion?"
      />
      <Pillar
        description="Pick the interval and the line redraws. The previous period sits behind it as a thin line, the average is a dashed line with its value, and the axis stays at 0 to 100 percent unless you ask it not to."
        label="Over time"
        points={[
          {
            title: 'Minute to month',
            text: 'Minutes for the launch hour, months for the board deck.',
          },
          {
            title: 'A fixed axis by default',
            text: '"Y axis: Fixed (0–100%)" so a 2-point move looks like a 2-point move. Switch to Auto to zoom.',
          },
          {
            title: 'Best day, worst day',
            text: 'Called out above the chart, with the overall rate and the opportunities behind it.',
          },
        ]}
        title="A rate you can watch"
        visual={
          <VisualMock bleed="right" frame="inset" name="conversion-chart" />
        }
      />
      <Pillar
        description="Add a breakdown and every value of the property becomes a line. The table under the chart gives the average rate, the totals and a heat cell per period for each one."
        label="Breakdown"
        points={[
          {
            title: 'Any event, profile or cohort property',
            text: 'Plan, country, campaign, device, or the cohort a user is in.',
          },
          {
            title: 'Best and worst breakdown',
            text: 'Two more cards, so the segment that moved is named.',
          },
          {
            title: 'Toggle series',
            text: 'Hide the noisy ones while you look at the rest.',
          },
        ]}
        reverse
        title="Which segment moved"
        visual={
          <VisualMock bleed="left" frame="inset" name="conversion-breakdown" />
        }
      />
      <Pillar
        description="Click a point on the chart and add a reference: the day you shipped the new pricing page, started the campaign, or changed the sign-up form. It shows on every chart in the project from then on."
        label="References"
        points={[
          {
            title: 'A marker from a click',
            text: 'Title and date, done. No separate annotations page.',
          },
          {
            title: 'On every chart',
            text: 'The same line appears on the overview and in every report.',
          },
          {
            title: 'The honest before and after',
            text: 'There is no significance test. There is the line, the reference, and the previous period behind it.',
          },
        ]}
        title="Mark the day you shipped"
        visual={
          <VisualMock frame="inset" name="conversion-reference" side="bottom" />
        }
      />
      <CardGrid
        items={[
          {
            title: 'Session or profile',
            description:
              'Count the pair inside one visit, or across visits for the same user.',
            visual: <MiniFunnelToggle />,
          },
          {
            title: 'A window in hours',
            description:
              'How long the second event may take after the first. Default 24 hours.',
            visual: <MiniFunnelWindow />,
          },
          {
            title: 'Compare to the previous period',
            description:
              'The rate and the count, with the change against the period before.',
            visual: <MiniCompare />,
          },
          {
            title: 'Any interval',
            description:
              'Minute, hour, day, week or month, limited only by the date range.',
            visual: <MiniInterval />,
          },
          {
            title: 'Cohorts as filters or breakdown',
            description:
              'Only people in a cohort, or every cohort as its own line.',
            visual: <MiniCohortFilter />,
          },
          {
            title: 'Conversion events, marked once',
            description:
              'Flag an event as important and it gets its own tab on the Events page.',
            visual: <MiniConversionFlag />,
          },
        ]}
        title="What else the report can do"
      />
      <StepsBand
        description="A conversion report is exactly two events. Everything else is a setting."
        steps={[
          {
            title: 'Track the two events',
            text: 'The start and the goal. Add the properties you want to break down by.',
            visual: <CodeSnippet compact lines={TRACK_CODE} />,
          },
          {
            title: 'Choose interval and breakdown',
            text: 'Day for the week view, week for the quarter. Break down by the variant property.',
            visual: <MiniInterval />,
          },
          {
            title: 'Read the trend',
            text: 'The line, the average, the best and worst period, the previous period behind.',
            visual: <MiniCompare />,
          },
        ]}
        title="How a conversion report is built"
      />
      <FeatureClosing data={data} />
    </>
  );
}
