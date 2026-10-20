import type { ChatLaunchHint } from '@openpanel/core/modules/assistant/assistant.constants';
import { ExternalLinkIcon, KeyRoundIcon, SparklesIcon } from 'lucide-react';
import CopyInput from '@/components/forms/copy-input';

const DEFAULT_PROMPTS = [
  'What changed this week compared to last week?',
  'Show me unique visitors per day for the last 30 days',
  'Build a dashboard for signups and where they come from',
  'How do I connect the MCP server to Claude?',
];

function promptsFor(hint?: ChatLaunchHint): string[] {
  switch (hint?.page) {
    case 'profile':
      return [
        'Tell me about this user',
        'What did they do in their last session?',
        'How does this user compare to a typical one?',
        'Which pages did they visit most?',
      ];
    case 'session':
      return [
        'Walk me through this session',
        'Where did this visitor come from?',
        'Did they convert?',
        'Show similar sessions from the same referrer',
      ];
    case 'dashboard':
      return [
        'Summarize this dashboard',
        'Which report changed the most this week?',
        'Add a chart of signups by referrer to this dashboard',
        'Which of these charts should I worry about?',
      ];
    case 'seo':
      return [
        'Which queries are the easiest wins?',
        'Is my organic traffic trending up?',
        'Any pages competing for the same query?',
        'Top pages in Google last 30 days',
      ];
    case 'pages':
      return [
        'Which pages have the highest bounce rate?',
        'Top entry pages last 7 days',
        'Which pages are losing traffic?',
        'Chart pageviews for /pricing over time',
      ];
    case 'events':
      return [
        'Which events fire most often?',
        'Show me the last 20 purchase events',
        'Build a funnel from signup to purchase',
        'Chart the daily count of each conversion event',
      ];
    default:
      return DEFAULT_PROMPTS;
  }
}

export function ChatEmpty({
  hint,
  onPick,
}: {
  hint?: ChatLaunchHint;
  onPick: (prompt: string) => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
        <SparklesIcon className="size-5" />
      </div>
      <div>
        <h1 className="font-semibold text-2xl">What do you want to know?</h1>
        <p className="mt-2 text-muted-foreground">
          Ask about your numbers, get charts inline, build dashboards, or ask
          how OpenPanel works.
        </p>
      </div>
      <div className="grid w-full gap-2 sm:grid-cols-2">
        {promptsFor(hint).map((prompt) => (
          <button
            className="rounded-xl border bg-card px-4 py-3 text-left text-sm transition-colors hover:bg-muted/60"
            key={prompt}
            onClick={() => onPick(prompt)}
            type="button"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChatNotConfigured() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 px-6 py-10 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <KeyRoundIcon className="size-5" />
      </div>
      <div>
        <h1 className="font-semibold text-2xl">AI chat is not configured</h1>
        <p className="mt-2 text-muted-foreground">
          Set <code className="font-mono text-sm">OPENAI_API_KEY</code> or{' '}
          <code className="font-mono text-sm">ANTHROPIC_API_KEY</code> on the
          API service and restart it.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <CopyInput label="OpenAI" value="OPENAI_API_KEY=sk-..." />
        <CopyInput label="Anthropic" value="ANTHROPIC_API_KEY=sk-ant-..." />
      </div>
      <a
        className="inline-flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
        href="https://openpanel.dev/docs/self-hosting/environment-variables#ai-features"
        rel="noopener"
        target="_blank"
      >
        View setup docs
        <ExternalLinkIcon className="size-3.5" />
      </a>
    </div>
  );
}
