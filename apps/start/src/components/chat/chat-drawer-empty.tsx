import { usePageContextValue } from '@/contexts/page-context';
import { SparklesIcon } from 'lucide-react';
import { useChatRuntime } from './chat-runtime';

/**
 * Empty-state panel shown when a chat has no messages yet. Headline,
 * description, and example prompts are tailored to the current page
 * so the user gets ideas relevant to what they're looking at. The
 * prompts are clickable — they fire the same `send()` as typing and
 * pressing Enter, so the user can kick off the conversation in one
 * tap.
 */
export function ChatDrawerEmpty() {
  const ctx = usePageContextValue();
  const { send } = useChatRuntime();
  const suggestions = getSuggestionsForContext(ctx);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-8 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
        <SparklesIcon className="size-5" />
      </div>
      <div className="max-w-xs">
        <h3 className="font-semibold text-xl mb-2">{suggestions.headline}</h3>
        <p className="mt-1.5 text-muted-foreground leading-[1.5]">
          {suggestions.description}
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-2 items-center">
        {suggestions.prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => send(prompt)}
            className="rounded-md border bg-muted/30 px-3 py-2 text-left text-sm text-foreground/80 transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

type Suggestions = {
  headline: string;
  description: string;
  prompts: string[];
};

function getSuggestionsForContext(
  ctx: ReturnType<typeof usePageContextValue>,
): Suggestions {
  if (!ctx) {
    return {
      headline: 'Ask about your data',
      description:
        'I can answer questions about your analytics, generate reports, and dig into users, sessions, or pages.',
      prompts: [
        'What happened yesterday?',
        'Show me last 7 days of traffic',
        'Which pages have the highest bounce rate?',
      ],
    };
  }

  switch (ctx.page) {
    case 'overview':
      return {
        headline: 'Ask about this overview',
        description:
          'I can explain trends, compare periods, or filter the page. Try a question or pick a starter.',
        prompts: [
          'What changed compared to the previous period?',
          'Filter to mobile only',
          'Show me last 7 days of traffic',
          'Which referrers drove the most sessions?',
        ],
      };

    case 'insights':
      return {
        headline: 'Explore your insights',
        description:
          'I can explain why an insight fired, find related ones, or walk you through the most important.',
        prompts: [
          'What are the most important insights right now?',
          'Explain the biggest anomaly this week',
          'Any insights related to device trends?',
        ],
      };

    case 'pages':
      return {
        headline: 'Ask about your pages',
        description:
          'I can rank pages by performance, find declining ones, or identify entry/exit patterns.',
        prompts: [
          'Which pages are declining vs last month?',
          'Show pages with the highest bounce rate',
          'Top entry pages in the last 7 days',
          'Find pages with underperforming SEO',
        ],
      };

    case 'seo':
      return {
        headline: 'Dig into your SEO',
        description:
          'I can surface high-opportunity queries, check for cannibalization, and correlate SEO with on-site engagement.',
        prompts: [
          'Queries on page 2 with high impressions (easy wins)',
          'Any query cannibalization I should fix?',
          'Which pages bring GSC clicks but bounce hard?',
          'Top SEO queries last 30 days',
        ],
      };

    case 'events':
      return {
        headline: 'Analyze your events',
        description:
          'I can analyze distribution, correlate events, and drill into properties.',
        prompts: [
          'Which events often happen together?',
          'Analyze event distribution by country',
          'Filter to signup events only',
          'What are the most common event properties?',
        ],
      };

    case 'profileDetail':
      return {
        headline: 'Ask about this user',
        description:
          'I can summarize this profile, build a journey, or compare them to the average user.',
        prompts: [
          "Tell me about this user's journey",
          'How does this user compare to average?',
          'What was their last session?',
          'Do they have unusual behavior?',
        ],
      };

    case 'sessionDetail':
      return {
        headline: 'Ask about this session',
        description:
          'I can walk through the path, compare to typical sessions, or explain the referrer context.',
        prompts: [
          'Walk me through this session',
          'How does this compare to typical sessions?',
          'Where did this traffic come from?',
          'Are there similar sessions today?',
        ],
      };

    case 'groupDetail':
      return {
        headline: 'Ask about this group',
        description:
          'I can show metrics, list members, and compare to peer groups.',
        prompts: [
          "Summarize this group's activity",
          'Compare to other groups',
          'Who are the most active members?',
          "What's this group's engagement trend?",
        ],
      };

    case 'reportEditor':
      return {
        headline: 'Edit this report with me',
        description:
          'I can preview changes, suggest breakdowns, or compare to the previous period.',
        prompts: [
          'Suggest useful breakdowns for this report',
          'Compare to the previous period',
          'Find anomalies in the current data',
          'Add a country breakdown',
        ],
      };

    case 'dashboard':
      return {
        headline: 'Ask about this dashboard',
        description:
          'I can summarize every report on this dashboard at once, flag what changed, or zoom into a single chart.',
        prompts: [
          'Summarize this dashboard',
          "What's underperforming here?",
          'Compare this dashboard to the previous period',
          'Which report has the biggest change?',
        ],
      };

    default:
      return {
        headline: 'Ask about your data',
        description:
          'I can answer questions about the page you\'re viewing, generate reports, and dig into specific users, sessions, or pages.',
        prompts: [
          "What's our visitor count this week?",
          'Top traffic sources right now',
          'Show me top pages by bounce rate',
        ],
      };
  }
}
