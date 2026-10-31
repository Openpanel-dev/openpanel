import { FeatureClosing, type FeaturePageProps } from './shared';
import { CardGrid } from '@/components/blocks/card-grid';
import { CodeSnippet } from '@/components/blocks/code-snippet';
import { CompareRow } from '@/components/blocks/compare-row';
import { FeatureHero } from '@/components/blocks/feature-hero';
import { Pillar } from '@/components/blocks/pillar';
import { SplitStat } from '@/components/blocks/split-stat';
import { StepsBand } from '@/components/blocks/steps-band';
import {
  BrowserFrame,
  RecordedPage,
} from '@/components/dashboard-mock/primitives-ui';
import { VisualMock } from '@/components/visual-mock';

const ENABLE_LINES = [
  { text: 'new OpenPanel({' },
  { text: "  clientId: 'YOUR_CLIENT_ID',", tone: 'string' as const },
  { text: '  sessionReplay: { enabled: true },' },
  { text: '});' },
];

export function SessionReplayPage({ data }: FeaturePageProps) {
  return (
    <>
      <FeatureHero
        description="Turn it on in the SDK config and every session gets a recording next to its events. Text and inputs are masked before they leave the browser. Replays stay 30 days."
        title={data.hero.heading}
        visual={<VisualMock name="replay" />}
      />
      <SplitStat
        items={[
          {
            value: '30',
            title: 'Days kept',
            text: 'Recordings expire after 30 days, on Cloud and self-hosted.',
          },
          {
            value: '100%',
            title: 'Masked by default',
            text: 'All text and all inputs, before anything leaves the browser.',
          },
          {
            value: '0 kB',
            title: 'In your bundle',
            text: 'The recorder loads on its own after your page is interactive.',
          },
        ]}
      />
      <Pillar
        description="The player sits on the session page, above the same events you already track. Click an event in the timeline and the recording jumps there. Long sessions stream in while you watch."
        label="Replay"
        points={[
          {
            title: 'Events on the scrubber',
            text: 'Every event is a tick. Ticks close together group into a count you can open.',
          },
          {
            title: 'The URL follows along',
            text: 'The address bar shows the page the user was on at that moment.',
          },
          {
            title: 'Chunks, not one big file',
            text: 'A recording arrives in pieces every ten seconds, so playback starts right away.',
          },
        ]}
        title="The recording and the events, together"
        visual={<VisualMock bleed="right" frame="inset" name="replay-player" />}
      />
      <Pillar
        description="Recording is strict by default. Text becomes asterisks and inputs are masked in the browser, so what you see in the player is what left the page. Open up only what you choose."
        label="Privacy"
        points={[
          {
            title: 'maskAllText and maskAllInputs are on',
            text: 'Unmask a selector you trust with unmaskTextSelector.',
          },
          {
            title: 'Block whole elements',
            text: 'Add data-openpanel-replay-block and the element is a grey box in the recording.',
          },
          {
            title: 'Hidden inputs never record',
            text: 'CSRF tokens and other hidden fields are always blocked.',
          },
        ]}
        reverse
        title="Masked before it leaves the browser"
        visual={<VisualMock bleed="left" frame="inset" name="replay-privacy" />}
      />
      <Pillar
        description="The replay script is not in your main bundle. It loads lazily after the page is interactive, records in the background, and sends small chunks that flush when the tab goes hidden."
        label="Performance"
        points={[
          {
            title: 'Lazy loaded',
            text: 'op1-replay.js is fetched after your page, never before it.',
          },
          {
            title: 'Sampled per page load',
            text: 'Set sampleRate to record a share of visits instead of all of them.',
          },
          {
            title: 'Small chunks',
            text: 'Every 10 seconds, at most 200 events or 1 MB per chunk.',
          },
        ]}
        title="Nothing in your bundle"
        visual={
          <VisualMock frame="inset" name="replay-loading" side="bottom" />
        }
      />
      <CompareRow
        description="The same sign-up page, recorded with the defaults and with text unmasked for a selector you chose."
        items={[
          {
            label: 'Defaults',
            caption: 'maskAllText: true, maskAllInputs: true',
            visual: (
              <BrowserFrame time="00:58 / 04:10" url="acme.io/signup">
                <RecordedPage masked />
              </BrowserFrame>
            ),
          },
          {
            label: "unmaskTextSelector: '.op-unmask'",
            caption: 'Headings and labels readable, inputs still masked',
            visual: (
              <BrowserFrame time="00:58 / 04:10" url="acme.io/signup">
                <RecordedPage masked={false} />
              </BrowserFrame>
            ),
          },
        ]}
        title="What a recording looks like"
      />
      <CardGrid
        items={[
          {
            title: '30-day retention',
            description:
              'Recordings are kept for 30 days and then deleted. No setting to forget.',
            visual: <VisualMock frame="bare" name="mini-kept-days" />,
          },
          {
            title: 'Unlimited replays',
            description:
              'No per-recording price and no quota. You pay for events, as always.',
            visual: <VisualMock frame="bare" name="mini-no-quota" />,
          },
          {
            title: 'Sampling',
            description:
              'Record every visit, or one in four. Decided per page load.',
            visual: <VisualMock frame="bare" name="mini-sample-rate" />,
          },
          {
            title: 'Your storage when self-hosted',
            description:
              'Chunks live in your own ClickHouse, compressed, with the same 30-day TTL.',
            visual: <VisualMock frame="bare" name="mini-replay-storage" />,
          },
          {
            title: 'Jump to an event',
            description:
              'Click any event in the timeline and the player seeks to it.',
            visual: <VisualMock frame="bare" name="mini-replay" />,
          },
          {
            title: 'Found from the sessions list',
            description:
              'Sessions with a recording carry a video icon. Click it to open the replay.',
            visual: <VisualMock frame="bare" name="mini-replay-row" />,
          },
        ]}
        title="What you get"
      />
      <StepsBand
        steps={[
          {
            title: 'Enable it in the config',
            text: 'One line in the web SDK init. Nothing else to install.',
            visual: <CodeSnippet compact lines={ENABLE_LINES} />,
          },
          {
            title: 'The recorder loads later',
            text: 'After your page is interactive, the replay script is fetched and starts recording.',
          },
          {
            title: 'Chunks are sent',
            text: 'Every 10 seconds, and when the tab is hidden or closed.',
          },
          {
            title: 'Open any session',
            text: 'Click the video icon on a session and watch it next to its events.',
          },
        ]}
        title="Four steps, one of them yours"
      />
      <FeatureClosing data={data} />
    </>
  );
}
