import { BotIcon } from 'lucide-react';
import { FeatureClosing, type FeaturePageProps } from './shared';
import { CardGrid } from '@/components/blocks/card-grid';
import { CodeSnippet } from '@/components/blocks/code-snippet';
import { FeatureHero } from '@/components/blocks/feature-hero';
import { Pillar } from '@/components/blocks/pillar';
import { SplitStat } from '@/components/blocks/split-stat';
import { StepsBand } from '@/components/blocks/steps-band';
import { MockBadge } from '@/components/dashboard-mock/primitives';
import { Timeline } from '@/components/dashboard-mock/primitives-ui';
import { VisualMock } from '@/components/visual-mock';

const MIDDLEWARE_SNIPPET = [
  { text: "import { wrapLanguageModel } from 'ai';" },
  { text: "import { openai } from '@ai-sdk/openai';" },
  { text: 'import { openpanelAiMiddleware }' },
  { text: "  from '@openpanel/ai/vercel';", tone: 'string' as const },
  { text: '' },
  { text: 'const model = wrapLanguageModel({' },
  { text: "  model: openai('gpt-5')," },
  { text: '  middleware:' },
  { text: '    openpanelAiMiddleware({ op }),' },
  { text: '});' },
];

const MIDDLEWARE_CARD_SNIPPET = MIDDLEWARE_SNIPPET.slice(5);

const CONTEXT_SNIPPET = [
  { text: 'await generateText({' },
  { text: '  model, messages,' },
  { text: '  providerOptions: { openpanel: {' },
  { text: '    profileId: user.id,', tone: 'string' as const },
  { text: "    name: 'inbox-summary',", tone: 'string' as const },
  { text: '    groups: [user.orgId],' },
  { text: '  } },' },
  { text: '});' },
];

const MANUAL_SNIPPET = [
  { text: 'op.ai({' },
  { text: "  kind: 'generation'," },
  { text: "  model: 'gpt-5-mini'," },
  { text: '  usage: { inputTokens: 812,' },
  { text: '           outputTokens: 140 },' },
  { text: '});' },
];

const GENERATIONS = [
  {
    name: 'draft-reply',
    model: 'claude-sonnet-5-5',
    tokens: '3,104',
    cost: '$0.004',
    latency: '1.2s',
  },
  {
    name: 'classify-intent',
    model: 'gpt-5-mini',
    tokens: '640',
    cost: '$0.001',
    latency: '0.4s',
  },
  {
    name: 'search-docs',
    model: 'claude-haiku-5-5',
    tokens: '1,210',
    cost: '$0.001',
    latency: '0.6s',
  },
];

function GenerationsCard() {
  return (
    <div className="col rounded-lg border border-neutral-200 bg-white text-[11.5px]">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-neutral-200 border-b px-3 py-1.5 font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
        <span>Step</span>
        <span>Cost</span>
        <span>Latency</span>
      </div>
      {GENERATIONS.map((row) => (
        <div
          className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 border-neutral-100 border-b px-3 py-1.5 last:border-b-0"
          key={row.name}
        >
          <span className="col min-w-0">
            <span className="truncate font-mono">{row.name}</span>
            <span className="truncate text-[10px] text-neutral-500">
              {row.model} · {row.tokens} tok
            </span>
          </span>
          <span className="font-mono text-neutral-600">{row.cost}</span>
          <span className="font-mono text-neutral-500">{row.latency}</span>
        </div>
      ))}
    </div>
  );
}

const SESSION_WITH_AI = [
  { label: 'screen_view', detail: '/inbox', time: '14:01' },
  {
    label: 'ai_generation',
    detail: 'inbox-summary · gpt-5 · 2,310 tok · $0.011',
    time: '14:01',
    highlight: true,
    icon: <BotIcon className="size-3" />,
  },
  { label: 'click', detail: 'Archive all', time: '14:02' },
  { label: 'screen_view', detail: '/settings/billing', time: '14:03' },
];

const AI_REFERRERS = [
  { name: 'ChatGPT', sessions: '312' },
  { name: 'Perplexity', sessions: '148' },
  { name: 'Claude', sessions: '96' },
  { name: 'Gemini', sessions: '41' },
];

function AiReferralsCard() {
  return (
    <div className="col rounded-lg border border-neutral-200 bg-white text-[12px]">
      <span className="border-neutral-200 border-b px-3 py-2 font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
        AI referrals
      </span>
      {AI_REFERRERS.map((row) => (
        <span
          className="row items-center justify-between border-neutral-100 border-b px-3 py-1.5 last:border-b-0"
          key={row.name}
        >
          {row.name}
          <span className="font-mono text-neutral-600">{row.sessions}</span>
        </span>
      ))}
    </div>
  );
}

function McpChatCard() {
  return (
    <div className="col gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-[12px]">
      <span className="max-w-[90%] self-end rounded-xl rounded-br-sm bg-neutral-100 px-3 py-1.5">
        What did the assistant cost per Pro user in October?
      </span>
      <span className="text-neutral-600">
        $0.17 per Pro user, down from $0.21 in September. draft-reply is 46% of
        it.
      </span>
      <span className="row gap-1.5">
        <MockBadge tone="blue">get_report_data</MockBadge>
      </span>
    </div>
  );
}

export function AiObservabilityPage({ data }: FeaturePageProps) {
  return (
    <>
      <FeatureHero
        description={data.hero.subheading}
        pill={{
          label: 'New',
          text: 'In beta. Read the docs',
          href: '/docs/ai-observability',
        }}
        title={data.hero.heading}
        visual={<VisualMock name="ai" />}
      />
      <SplitStat
        items={[
          {
            value: '1',
            title: 'package',
            text: 'Wraps the Vercel AI SDK, the OpenAI client and the Anthropic client. Every provider they reach, Azure and OpenRouter included.',
          },
          {
            value: '4',
            title: 'event kinds',
            text: 'generation, embedding, span and trace, as ordinary events with flat ai_* properties.',
          },
          {
            value: '30',
            title: 'days of content',
            text: 'Prompts and completions are kept that long, if you store them at all. Cost and tokens stay.',
          },
        ]}
      />
      <Pillar
        description="Every call carries its model, tokens and cost, and the profile, session and group it belongs to. So the question is not what the API bill was, but which feature, which plan and which customer it went to."
        label="Cost"
        link={{ href: '/docs/ai-observability', text: 'Read the docs' }}
        points={[
          {
            title: 'A price catalog, or your own cost',
            text: 'Major providers are priced for you. Send cost when a gateway already knows it.',
          },
          {
            title: 'Per model, feature, user and group',
            text: 'The AI overview breaks cost down by all four.',
          },
          {
            title: 'On the profile and the session',
            text: 'An AI usage widget with lifetime cost, tokens, latency and errors.',
          },
        ]}
        title="What a user costs you"
        visual={<VisualMock bleed="right" frame="inset" name="ai-cost" />}
      />
      <Pillar
        description="An agent runs the model several times and calls tools in between. Wrap the request once and every step lands in one trace, laid out in time, with the step that failed in red."
        label="Traces"
        points={[
          {
            title: 'Multi-step chains and tool calls',
            text: 'withAiContext groups a request; nested contexts merge over it.',
          },
          {
            title: 'Errors and latency per step',
            text: 'Time to first token on streams, the finish reason, the error that was rethrown.',
          },
          {
            title: 'Conversations across requests',
            text: 'Pass a conversationId and the thread reads as one.',
          },
        ]}
        reverse
        title="Traces for agents"
        visual={<VisualMock bleed="left" frame="inset" name="ai-trace" />}
      />
      <Pillar
        description="Tokens, cost, latency and errors are analytics. Prompts and completions are content. OpenPanel keeps the first always and the second only when you say so, and never for more than 30 days."
        label="Privacy"
        points={[
          {
            title: 'Content storage is a switch',
            text: 'Off for the project, or privacyMode per call.',
          },
          {
            title: '30-day expiry',
            text: 'Stored content is dropped after a month. The numbers stay with your other events.',
          },
          {
            title: 'Self-host for full control',
            text: 'The events land in your own ClickHouse.',
          },
        ]}
        title="Prompts only if you want them"
        visual={<VisualMock frame="inset" name="ai-settings" side="bottom" />}
      />
      <CardGrid
        description="How the events get in, and where else they show up."
        items={[
          {
            title: 'Wrap the SDK you already use',
            description:
              'wrapLanguageModel for the Vercel AI SDK, wrapOpenAI or wrapAnthropic around the official clients. Sending never blocks the model.',
            visual: <CodeSnippet compact lines={MIDDLEWARE_CARD_SNIPPET} />,
          },
          {
            title: 'Or send the events yourself',
            description:
              'op.ai() in the Node SDK, or the raw payload from any language.',
            visual: <CodeSnippet compact lines={MANUAL_SNIPPET} />,
          },
          {
            title: 'A generations list',
            description:
              'Every call with its model, tokens, cost, latency and status, and the conversation if you stored it.',
            visual: <GenerationsCard />,
          },
          {
            title: 'In the session timeline',
            description:
              'The model call sits between the page views and clicks around it.',
            visual: <Timeline items={SESSION_WITH_AI} />,
            href: '/features/session-tracking',
          },
          {
            title: 'AI assistants as a traffic source',
            description:
              'Sessions referred by ChatGPT, Claude, Perplexity, Gemini, Copilot, Grok, Mistral and Kagi, on the SEO page.',
            visual: <AiReferralsCard />,
            href: '/features/web-analytics',
          },
          {
            title: 'Ask about it',
            description:
              'AI events are ordinary events, so the MCP server and the chat can report on them.',
            visual: <McpChatCard />,
            href: '/features/mcp',
          },
        ]}
        title="In and out"
      />
      <StepsBand
        steps={[
          {
            title: 'Wrap the model',
            text: 'One middleware on wrapLanguageModel, with the OpenPanel client you already have.',
            visual: <CodeSnippet compact lines={MIDDLEWARE_SNIPPET} />,
          },
          {
            title: 'Say who and what',
            text: 'profileId, a feature name and groups per call, or once per request with withAiContext.',
            visual: <CodeSnippet compact lines={CONTEXT_SNIPPET} />,
          },
          {
            title: 'Read cost, traces and the people behind them',
            text: 'The AI section, the profile, the session, and any report you build on ai_* properties.',
            visual: <StepReports />,
          },
        ]}
        title="Three steps, then it is just events"
      />
      <FeatureClosing data={data} />
    </>
  );
}

const AI_REPORTS = [
  { label: 'Sum of ai_cost', by: 'by ai_model' },
  { label: 'p95 of ai_latency_ms', by: 'by ai_name' },
  { label: 'Funnel', by: 'screen_view → ai_generation → upgrade' },
  { label: 'Cohort', by: 'ai_generation at least 5 times' },
];

function StepReports() {
  return (
    <div className="col gap-1.5 text-[12px]">
      <span className="font-medium text-neutral-700">
        Reports on ai_* events
      </span>
      <div className="col divide-y divide-neutral-100 rounded-md border border-neutral-200">
        {AI_REPORTS.map((report) => (
          <span
            className="row items-center gap-2 px-2.5 py-1.5"
            key={report.label}
          >
            <span className="size-1.5 shrink-0 rounded-full bg-blue-600" />
            <span className="whitespace-nowrap font-medium">
              {report.label}
            </span>
            <span className="truncate font-mono text-[11px] text-neutral-500">
              {report.by}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
