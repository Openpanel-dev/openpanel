import { FeatureClosing, type FeaturePageProps } from './shared';
import { CardGrid } from '@/components/blocks/card-grid';
import { CodeSnippet } from '@/components/blocks/code-snippet';
import { CompareRow } from '@/components/blocks/compare-row';
import { FeatureHero } from '@/components/blocks/feature-hero';
import { Pillar } from '@/components/blocks/pillar';
import { StepsBand } from '@/components/blocks/steps-band';
import { HeatGrid } from '@/components/dashboard-mock/primitives';
import { MiniReportActions } from '@/components/dashboard-mock/product-analytics';
import {
  MiniCohortCard,
  MiniCriteria,
  MiniTwoEvents,
  MiniUnit,
  MiniWeightedAverage,
  RetentionCurve,
} from '@/components/dashboard-mock/product-retention';
import { VisualMock } from '@/components/visual-mock';

const TRACK_CODE = [
  { text: '// the start event', tone: 'muted' as const },
  { text: "op.track('sign_up');" },
  { text: '' },
  { text: '// the return event', tone: 'muted' as const },
  { text: "op.track('project_created');" },
];

const CRITERIA_COLUMNS = ['week 1', 'week 2', 'week 3'];

export function RetentionPage({ data }: FeaturePageProps) {
  return (
    <>
      <FeatureHero
        description="Pick a start event and a return event. Get a cohort grid and a curve, with an average that ignores the weeks that have not happened yet."
        title={data.hero.heading}
        visual={<VisualMock name="retention" />}
      />
      <Pillar
        description="Rows are cohorts, grouped by the week they first did the start event. Columns are the weeks after. The first row is the weighted average, and it only counts cells whose week has passed, so last week's cohort does not drag it down."
        label="Cohorts"
        points={[
          {
            title: 'Cohort, total profiles, then the weeks',
            text: 'Darker blue is higher retention. Empty cells are weeks that have not happened yet.',
          },
          {
            title: 'A weighted average you can trust',
            text: 'Immature cells are left out instead of counted as zero.',
          },
          {
            title: '"On or After", or "On"',
            text: 'Count anyone who came back from week 3 on, or only in week 3 itself.',
          },
        ]}
        title="The grid, read honestly"
        visual={
          <VisualMock bleed="right" frame="inset" name="retention-grid" />
        }
      />
      <Pillar
        description="Retention is not tied to sessions or a fixed notion of activity. Several event names can count as the start, several as the return, and the period can be anything from a minute to a month."
        label="Flexible"
        points={[
          {
            title: 'Several events per side',
            text: 'Start with sign_up or trial_started; return with project_created.',
          },
          {
            title: 'Minute to month',
            text: 'Daily retention for a game, monthly for a tax tool.',
          },
          {
            title: 'Count or percent',
            text: 'The same grid as absolute profiles or as a share of the cohort.',
          },
        ]}
        reverse
        title="Any event, any period"
        visual={
          <VisualMock bleed="left" frame="inset" name="retention-setup" />
        }
      />
      <Pillar
        description="Narrow the audience with property filters or a cohort, and the grid recalculates for just those people. To compare two groups, save two reports and put them side by side on a dashboard."
        label="Filters and cohorts"
        points={[
          {
            title: 'Property filters',
            text: 'plan is Pro, country is Sweden, referrer is Product Hunt.',
          },
          {
            title: 'In cohort, not in cohort',
            text: 'Any cohort you have built, as a filter on the audience.',
          },
          {
            title: 'Two reports beat one breakdown',
            text: 'Retention has no breakdown. Two saved reports on one dashboard are the honest comparison.',
          },
        ]}
        title="Narrow the audience"
        visual={
          <VisualMock frame="inset" name="retention-filtered" side="bottom" />
        }
      />
      <CompareRow
        description="The same cohort, two ways to count a return. Pick the one that matches your question."
        items={[
          {
            label: 'On or After',
            caption:
              'Retained in week 2 if they came back in week 2 or any later week. Curves go down smoothly.',
            visual: (
              <HeatGrid
                columns={CRITERIA_COLUMNS}
                rows={[
                  { label: 'Oct 6', size: '1,312', values: [51, 42, 36] },
                  { label: 'Oct 13', size: '1,405', values: [53, 44, 38] },
                  { label: 'Oct 20', size: '1,388', values: [55, 46] },
                ]}
                sizeLabel="Profiles"
              />
            ),
          },
          {
            label: 'On',
            caption:
              'Retained in week 2 only if they came back in week 2 itself. Shows the real weekly habit.',
            visual: (
              <HeatGrid
                columns={CRITERIA_COLUMNS}
                rows={[
                  { label: 'Oct 6', size: '1,312', values: [41, 28, 24] },
                  { label: 'Oct 13', size: '1,405', values: [43, 30, 26] },
                  { label: 'Oct 20', size: '1,388', values: [45, 31] },
                ]}
                sizeLabel="Profiles"
              />
            ),
          },
        ]}
        title="Two criteria"
      />
      <CardGrid
        items={[
          {
            title: 'The weighted average',
            description:
              'One row above the cohorts, pooled across them and blind to weeks that have not come.',
            visual: <MiniWeightedAverage />,
          },
          {
            title: 'Criteria',
            description: '"On or After" for stickiness, "On" for habit.',
            visual: <MiniCriteria />,
          },
          {
            title: 'Count or percent',
            description:
              'Switch the unit and the cells change, the colours stay.',
            visual: <MiniUnit />,
          },
          {
            title: 'Curve and grid together',
            description:
              'The average per period as a curve above the grid. No view to switch.',
            visual: <RetentionCurve height={64} />,
          },
          {
            title: 'Cohorts you define',
            description:
              'People who did something, or who have a property, refreshed every 30 minutes.',
            visual: <MiniCohortCard />,
          },
          {
            title: 'Save, share, export',
            description:
              'Pin it to a dashboard next to the funnel, share a link, download the grid.',
            visual: <MiniReportActions />,
          },
        ]}
        title="The details"
      />
      <StepsBand
        description="Retention is two events. If you already track them, the report is a minute away."
        steps={[
          {
            title: 'Track the start and the return',
            text: 'Signing up and coming back to do the thing your product is for.',
            visual: <CodeSnippet compact lines={TRACK_CODE} />,
          },
          {
            title: 'Pick them in the report',
            text: 'Start event, return event, the period. Add filters if you want a slice.',
            visual: <MiniTwoEvents />,
          },
          {
            title: 'Read the curve and the grid',
            text: 'Where the curve flattens is your floor. The grid tells you which cohorts sit above it.',
            visual: <MiniWeightedAverage />,
          },
        ]}
        title="How retention is built"
      />
      <FeatureClosing data={data} />
    </>
  );
}
