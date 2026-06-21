import CopyInput from '@/components/forms/copy-input';
import { usePageContextValue } from '@/contexts/page-context';
import type { TFunction } from 'i18next';
import { ExternalLinkIcon, KeyRoundIcon, SparklesIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const suggestions = getSuggestionsForContext(ctx, t);

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
          {t('chat.ai_not_configured_setup_prefix')}{' '}
          <code className="font-mono text-sm">OPENAI_API_KEY</code>{' '}
          {t('chat.ai_not_configured_setup_between')}{' '}
          <code className="font-mono text-sm">ANTHROPIC_API_KEY</code>{' '}
          {t('chat.ai_not_configured_setup_suffix')}{' '}
          {t('chat.ai_not_configured_description')}
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
  headline: string;
  description: string;
  prompts: string[];
};

function getSuggestionsForContext(
  ctx: ReturnType<typeof usePageContextValue>,
  t: TFunction,
): Suggestions {
  if (!ctx) {
    return {
      headline: t('chat.empty_no_context_headline'),
      description: t('chat.empty_no_context_description'),
      prompts: [
        t('chat.empty_no_context_prompt_what_happened_yesterday'),
        t('chat.empty_no_context_prompt_last_seven_days_traffic'),
        t('chat.empty_no_context_prompt_highest_bounce_rate'),
      ],
    };
  }

  switch (ctx.page) {
    case 'overview':
      return {
        headline: t('chat.empty_overview_headline'),
        description: t('chat.empty_overview_description'),
        prompts: [
          t('chat.empty_overview_prompt_compare_previous_period'),
          t('chat.empty_overview_prompt_filter_mobile_only'),
          t('chat.empty_overview_prompt_last_seven_days_traffic'),
          t('chat.empty_overview_prompt_top_referrers'),
        ],
      };

    case 'insights':
      return {
        headline: t('chat.empty_insights_headline'),
        description: t('chat.empty_insights_description'),
        prompts: [
          t('chat.empty_insights_prompt_most_important'),
          t('chat.empty_insights_prompt_biggest_anomaly'),
          t('chat.empty_insights_prompt_device_trends'),
        ],
      };

    case 'pages':
      return {
        headline: t('chat.empty_pages_headline'),
        description: t('chat.empty_pages_description'),
        prompts: [
          t('chat.empty_pages_prompt_declining_pages'),
          t('chat.empty_pages_prompt_highest_bounce_rate'),
          t('chat.empty_pages_prompt_top_entry_pages'),
          t('chat.empty_pages_prompt_underperforming_seo'),
        ],
      };

    case 'seo':
      return {
        headline: t('chat.empty_seo_headline'),
        description: t('chat.empty_seo_description'),
        prompts: [
          t('chat.empty_seo_prompt_page_two_queries'),
          t('chat.empty_seo_prompt_query_cannibalization'),
          t('chat.empty_seo_prompt_gsc_clicks_bounce_hard'),
          t('chat.empty_seo_prompt_top_seo_queries'),
        ],
      };

    case 'events':
      return {
        headline: t('chat.empty_events_headline'),
        description: t('chat.empty_events_description'),
        prompts: [
          t('chat.empty_events_prompt_events_together'),
          t('chat.empty_events_prompt_distribution_by_country'),
          t('chat.empty_events_prompt_signup_events_only'),
          t('chat.empty_events_prompt_common_properties'),
        ],
      };

    case 'profileDetail':
      return {
        headline: t('chat.empty_profile_detail_headline'),
        description: t('chat.empty_profile_detail_description'),
        prompts: [
          t('chat.empty_profile_detail_prompt_user_journey'),
          t('chat.empty_profile_detail_prompt_compare_average'),
          t('chat.empty_profile_detail_prompt_last_session'),
          t('chat.empty_profile_detail_prompt_unusual_behavior'),
        ],
      };

    case 'sessionDetail':
      return {
        headline: t('chat.empty_session_detail_headline'),
        description: t('chat.empty_session_detail_description'),
        prompts: [
          t('chat.empty_session_detail_prompt_walk_through'),
          t('chat.empty_session_detail_prompt_compare_typical'),
          t('chat.empty_session_detail_prompt_traffic_source'),
          t('chat.empty_session_detail_prompt_similar_sessions'),
        ],
      };

    case 'groupDetail':
      return {
        headline: t('chat.empty_group_detail_headline'),
        description: t('chat.empty_group_detail_description'),
        prompts: [
          t('chat.empty_group_detail_prompt_summarize_activity'),
          t('chat.empty_group_detail_prompt_compare_groups'),
          t('chat.empty_group_detail_prompt_active_members'),
          t('chat.empty_group_detail_prompt_engagement_trend'),
        ],
      };

    case 'reportEditor':
      return {
        headline: t('chat.empty_report_editor_headline'),
        description: t('chat.empty_report_editor_description'),
        prompts: [
          t('chat.empty_report_editor_prompt_useful_breakdowns'),
          t('chat.empty_report_editor_prompt_compare_previous_period'),
          t('chat.empty_report_editor_prompt_find_anomalies'),
          t('chat.empty_report_editor_prompt_country_breakdown'),
        ],
      };

    case 'dashboard':
      return {
        headline: t('chat.empty_dashboard_headline'),
        description: t('chat.empty_dashboard_description'),
        prompts: [
          t('chat.empty_dashboard_prompt_summarize_dashboard'),
          t('chat.empty_dashboard_prompt_underperforming'),
          t('chat.empty_dashboard_prompt_compare_previous_period'),
          t('chat.empty_dashboard_prompt_biggest_change'),
        ],
      };

    default:
      return {
        headline: t('chat.empty_default_context_headline'),
        description: t('chat.empty_default_context_description'),
        prompts: [
          t('chat.empty_default_context_prompt_visitor_count'),
          t('chat.empty_default_context_prompt_top_traffic_sources'),
          t('chat.empty_default_context_prompt_top_pages_bounce_rate'),
        ],
      };
  }
}
