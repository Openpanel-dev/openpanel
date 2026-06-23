import CopyInput from '@/components/forms/copy-input';
import { usePageContextValue } from '@/contexts/page-context';
import { ExternalLinkIcon, KeyRoundIcon, SparklesIcon } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { useChatRuntime } from './chat-runtime';

/**
 * Empty-state panel shown inside the drawer body when a chat has no
 * messages yet — page-aware suggestion prompts. The "AI not configured"
 * variant is a separate component (`ChatDrawerNotConfigured` below)
 * rendered directly from `<ChatDrawer>` without the runtime, since
 * it doesn't depend on an agent being available.
 */
export function ChatDrawerEmpty() {
  const { t } = useTranslation();
  const ctx = usePageContextValue();
  const { send } = useChatRuntime();
  const suggestions = getSuggestionsForContext(ctx);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-8 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
        <SparklesIcon className="size-5" />
      </div>
      <div className="max-w-xs">
        <h3 className="font-semibold text-xl mb-2">
          {t(suggestions.headlineKey)}
        </h3>
        <p className="mt-1.5 text-muted-foreground leading-[1.5]">
          {t(suggestions.descriptionKey)}
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-2 items-center">
        {suggestions.promptKeys.map((promptKey) => {
          const prompt = t(promptKey);
          return (
            <button
              key={promptKey}
              type="button"
              onClick={() => send(prompt)}
              className="rounded-md border bg-muted/30 px-3 py-2 text-left text-sm text-foreground/80 transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              {prompt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ChatDrawerNotConfigured() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-8 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <KeyRoundIcon className="size-5" />
      </div>
      <div className="max-w-xs">
        <h3 className="font-semibold text-xl mb-2">
          {t('chat.ai_not_configured')}
        </h3>
        <p className="mt-1.5 text-muted-foreground leading-[1.5]">
          <Trans
            components={{
              openai: <code className="font-mono text-sm" />,
              anthropic: <code className="font-mono text-sm" />,
            }}
            i18nKey="chat.ai_not_configured_setup"
          />
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-2">
        <CopyInput label="OpenAI" value="OPENAI_API_KEY=sk-..." />
        <CopyInput label="Anthropic" value="ANTHROPIC_API_KEY=sk-ant-..." />
      </div>
      <a
        href="https://openpanel.dev/docs/self-hosting/environment-variables#ai-features"
        target="_blank"
        rel="noopener"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        {t('chat.view_setup_docs')}
        <ExternalLinkIcon className="size-3.5" />
      </a>
    </div>
  );
}

type Suggestions = {
  headlineKey: string;
  descriptionKey: string;
  promptKeys: string[];
};

function getSuggestionsForContext(
  ctx: ReturnType<typeof usePageContextValue>,
): Suggestions {
  if (!ctx) {
    return {
      headlineKey: 'chat.empty_no_context_headline',
      descriptionKey: 'chat.empty_no_context_description',
      promptKeys: [
        'chat.empty_no_context_prompt_what_happened_yesterday',
        'chat.empty_no_context_prompt_last_seven_days_traffic',
        'chat.empty_no_context_prompt_highest_bounce_rate',
      ],
    };
  }

  switch (ctx.page) {
    case 'overview':
      return {
        headlineKey: 'chat.empty_overview_headline',
        descriptionKey: 'chat.empty_overview_description',
        promptKeys: [
          'chat.empty_overview_prompt_compare_previous_period',
          'chat.empty_overview_prompt_filter_mobile_only',
          'chat.empty_overview_prompt_last_seven_days_traffic',
          'chat.empty_overview_prompt_top_referrers',
        ],
      };

    case 'insights':
      return {
        headlineKey: 'chat.empty_insights_headline',
        descriptionKey: 'chat.empty_insights_description',
        promptKeys: [
          'chat.empty_insights_prompt_most_important',
          'chat.empty_insights_prompt_biggest_anomaly',
          'chat.empty_insights_prompt_device_trends',
        ],
      };

    case 'pages':
      return {
        headlineKey: 'chat.empty_pages_headline',
        descriptionKey: 'chat.empty_pages_description',
        promptKeys: [
          'chat.empty_pages_prompt_declining_pages',
          'chat.empty_pages_prompt_highest_bounce_rate',
          'chat.empty_pages_prompt_top_entry_pages',
          'chat.empty_pages_prompt_underperforming_seo',
        ],
      };

    case 'seo':
      return {
        headlineKey: 'chat.empty_seo_headline',
        descriptionKey: 'chat.empty_seo_description',
        promptKeys: [
          'chat.empty_seo_prompt_page_two_queries',
          'chat.empty_seo_prompt_query_cannibalization',
          'chat.empty_seo_prompt_gsc_clicks_bounce_hard',
          'chat.empty_seo_prompt_top_seo_queries',
        ],
      };

    case 'events':
      return {
        headlineKey: 'chat.empty_events_headline',
        descriptionKey: 'chat.empty_events_description',
        promptKeys: [
          'chat.empty_events_prompt_events_together',
          'chat.empty_events_prompt_distribution_by_country',
          'chat.empty_events_prompt_signup_events_only',
          'chat.empty_events_prompt_common_properties',
        ],
      };

    case 'profileDetail':
      return {
        headlineKey: 'chat.empty_profile_detail_headline',
        descriptionKey: 'chat.empty_profile_detail_description',
        promptKeys: [
          'chat.empty_profile_detail_prompt_user_journey',
          'chat.empty_profile_detail_prompt_compare_average',
          'chat.empty_profile_detail_prompt_last_session',
          'chat.empty_profile_detail_prompt_unusual_behavior',
        ],
      };

    case 'sessionDetail':
      return {
        headlineKey: 'chat.empty_session_detail_headline',
        descriptionKey: 'chat.empty_session_detail_description',
        promptKeys: [
          'chat.empty_session_detail_prompt_walk_through',
          'chat.empty_session_detail_prompt_compare_typical',
          'chat.empty_session_detail_prompt_traffic_source',
          'chat.empty_session_detail_prompt_similar_sessions',
        ],
      };

    case 'groupDetail':
      return {
        headlineKey: 'chat.empty_group_detail_headline',
        descriptionKey: 'chat.empty_group_detail_description',
        promptKeys: [
          'chat.empty_group_detail_prompt_summarize_activity',
          'chat.empty_group_detail_prompt_compare_groups',
          'chat.empty_group_detail_prompt_active_members',
          'chat.empty_group_detail_prompt_engagement_trend',
        ],
      };

    case 'reportEditor':
      return {
        headlineKey: 'chat.empty_report_editor_headline',
        descriptionKey: 'chat.empty_report_editor_description',
        promptKeys: [
          'chat.empty_report_editor_prompt_useful_breakdowns',
          'chat.empty_report_editor_prompt_compare_previous_period',
          'chat.empty_report_editor_prompt_find_anomalies',
          'chat.empty_report_editor_prompt_country_breakdown',
        ],
      };

    case 'dashboard':
      return {
        headlineKey: 'chat.empty_dashboard_headline',
        descriptionKey: 'chat.empty_dashboard_description',
        promptKeys: [
          'chat.empty_dashboard_prompt_summarize_dashboard',
          'chat.empty_dashboard_prompt_underperforming',
          'chat.empty_dashboard_prompt_compare_previous_period',
          'chat.empty_dashboard_prompt_biggest_change',
        ],
      };

    default:
      return {
        headlineKey: 'chat.empty_default_context_headline',
        descriptionKey: 'chat.empty_default_context_description',
        promptKeys: [
          'chat.empty_default_context_prompt_visitor_count',
          'chat.empty_default_context_prompt_top_traffic_sources',
          'chat.empty_default_context_prompt_top_pages_bounce_rate',
        ],
      };
  }
}
