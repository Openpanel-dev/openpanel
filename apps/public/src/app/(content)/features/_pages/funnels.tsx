import { FeatureClosing, type FeaturePageProps } from './shared';
import { CardGrid } from '@/components/blocks/card-grid';
import { CodeSnippet } from '@/components/blocks/code-snippet';
import { FeatureHero } from '@/components/blocks/feature-hero';
import { Pillar } from '@/components/blocks/pillar';
import { ProofStrip } from '@/components/blocks/proof-strip';
import { StepsBand } from '@/components/blocks/steps-band';
import { MiniFunnel } from '@/components/dashboard-mock/minis';
import {
  MiniCohortFilter,
  MiniCompare,
  MiniFunnelToggle,
  MiniFunnelWindow,
  MiniReportActions,
  MiniStepPicker,
} from '@/components/dashboard-mock/product-analytics';
import { VisualMock } from '@/components/visual-mock';

const TRACK_CODE = [
  { text: "op.track('visited_pricing');" },
  { text: "op.track('started_trial', {", tone: 'keyword' as const },
  { text: "  plan: 'pro',", tone: 'string' as const },
  { text: '});' },
  { text: "op.track('upgraded');" },
];

export function FunnelsPage({ data }: FeaturePageProps) {
  return (
    <>
      <FeatureHero
        description="Pick the events, in order, and see how many people made it to each one. Count per session or per user, break it down by anything, and open the users who dropped off."
        title={data.hero.heading}
        visual={<VisualMock name="funnel" />}
      />
      <ProofStrip quote={1} />
      <Pillar
        description="Every step is an event with its own filters. The table shows who completed each one, who dropped after it, and the step that loses the most people, in red."
        label="Drop-off"
        link={{ href: '/docs/dashboard/reports', text: 'How reports work' }}
        points={[
          {
            title: 'Lettered steps, each with filters',
            text: 'Step A can be "screen_view where path is /pricing"; step B any event you like.',
          },
          {
            title: 'The biggest drop stands out',
            text: '"Most drop-offs after" names the step and how many left there.',
          },
          {
            title: 'Per session or per user',
            text: 'One switch, "Funnel Group", counts journeys inside one visit or across visits.',
          },
        ]}
        title="See where people stop"
        visual={<VisualMock bleed="right" frame="inset" name="funnel-steps" />}
      />
      <Pillar
        description="Break the same funnel down by country, plan, campaign or cohort. Each segment gets its own bars and its own row, with the best and the biggest called out above."
        label="Breakdown"
        points={[
          {
            title: 'Any property, from any step',
            text: 'Event, profile, group or cohort properties. "From step" picks where the value is read.',
          },
          {
            title: 'Highest rate and most conversions',
            text: 'Two cards above the chart, so the answer does not hide in the table.',
          },
          {
            title: 'Ten rows shown, the rest one click away',
            text: 'Toggle segments on and off while you edit.',
          },
        ]}
        reverse
        title="The same funnel, per segment"
        visual={
          <VisualMock bleed="left" frame="inset" name="funnel-breakdown" />
        }
      />
      <Pillar
        description="A percentage is a question. The answer is the people behind it. Open who completed a step or who dropped off after it, and land on their profiles and sessions."
        label="Drill down"
        points={[
          {
            title: 'Completed or dropped off',
            text: 'One toggle in the "View Users" modal, for any step.',
          },
          {
            title: 'Straight to the profile',
            text: 'Their sessions, their events, their revenue.',
          },
          {
            title: 'Then filter by them',
            text: 'Build a cohort with the same criteria and use it in any report.',
          },
        ]}
        title="From a bar to the people behind it"
        visual={<VisualMock frame="inset" name="funnel-users" side="bottom" />}
      />
      <CardGrid
        description="The settings you reach for once the first funnel is built."
        items={[
          {
            title: 'Session or profile',
            description:
              'Count journeys inside one visit, or let a user come back tomorrow to finish.',
            visual: <MiniFunnelToggle />,
          },
          {
            title: 'A window in hours',
            description:
              'How long a journey may take, from the first step to the last. Default 24 hours.',
            visual: <MiniFunnelWindow />,
          },
          {
            title: 'Compare to the previous period',
            description:
              'Conversion and completed, with the change against the period before.',
            visual: <MiniCompare />,
          },
          {
            title: 'As many steps as you need',
            description:
              'Drag to reorder. Up to 64 steps, though most funnels are five.',
            visual: <MiniFunnel />,
          },
          {
            title: 'Cohorts as filters or breakdown',
            description:
              'Only people in a cohort, or every cohort side by side.',
            visual: <MiniCohortFilter />,
          },
          {
            title: 'Save, share, export',
            description:
              'Pin it to a dashboard, share a public link, download the table as CSV.',
            visual: <MiniReportActions />,
          },
        ]}
        title="Everything else about funnels"
      />
      <StepsBand
        description="No funnel-specific tracking. The events you already send are the steps."
        steps={[
          {
            title: 'Track the events',
            text: 'One call per step from your site, app or backend.',
            visual: <CodeSnippet compact lines={TRACK_CODE} />,
          },
          {
            title: 'Pick them in the report builder',
            text: 'Add events as steps A, B, C. Drag to reorder, add filters per step.',
            visual: (
              <div className="rounded-xl bg-white p-3 ring-1 ring-black/6">
                <MiniStepPicker />
              </div>
            ),
          },
          {
            title: 'Read the drop-off, open the users',
            text: 'Conversion per step, the biggest leak in red, and the people behind every number.',
            visual: (
              <div className="rounded-xl bg-white p-3 ring-1 ring-black/6">
                <MiniCompare />
              </div>
            ),
          },
        ]}
        title="How a funnel is built"
      />
      <FeatureClosing data={data} />
    </>
  );
}
