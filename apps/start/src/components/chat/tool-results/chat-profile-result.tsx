import {
  asProfileFullOutput,
  isProfileFullError,
  type ProfileFullSuccess,
} from './output-types';
import { useTranslation } from 'react-i18next';
import {
  ResultCard,
  ResultLabel,
  ResultRow,
  ResultValue,
  ToolStateGuard,
} from './shared';
import type { ToolResultProps } from './types';

/**
 * Renders the result of `get_profile_full` — profile + metrics + recent
 * sessions. Card-with-rows layout so it stays narrow-friendly.
 */
export function ChatProfileFullResult({ part }: ToolResultProps) {
  return (
    <ToolStateGuard
      state={part.state}
      errorText={part.errorText}
      toolName={part.type.replace(/^tool-/, '')}
    >
      <Inner output={part.output} />
    </ToolStateGuard>
  );
}

function Inner({ output }: { output: unknown }) {
  const { t } = useTranslation();
  const value = asProfileFullOutput(output);
  if (!value) {
    return (
      <ResultCard>
        <div className="px-3 py-2 text-sm text-muted-foreground">
          {t('chat.result_no_profile')}
        </div>
      </ResultCard>
    );
  }

  if (isProfileFullError(value)) {
    return (
      <ResultCard>
        <div className="px-3 py-2 text-sm text-muted-foreground">
          {value.error}
        </div>
      </ResultCard>
    );
  }

  return <SuccessCard value={value} />;
}

function SuccessCard({ value }: { value: ProfileFullSuccess }) {
  const { t } = useTranslation();
  const { profile, metrics, dashboard_url } = value;
  const title =
    profile &&
    (`${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim() ||
      profile.email ||
      profile.id);

  return (
    <ResultCard title={title || t('chat.result_profile')}>
      {metrics && (
        <div className="border-b">
          {typeof metrics.sessions === 'number' && (
            <ResultRow>
              <ResultLabel>{t('chat.result_sessions')}</ResultLabel>
              <ResultValue>{metrics.sessions}</ResultValue>
            </ResultRow>
          )}
          {typeof metrics.totalEvents === 'number' && (
            <ResultRow>
              <ResultLabel>{t('chat.result_total_events')}</ResultLabel>
              <ResultValue>{metrics.totalEvents}</ResultValue>
            </ResultRow>
          )}
          {typeof metrics.avgSessionDurationMin === 'number' && (
            <ResultRow>
              <ResultLabel>{t('chat.result_avg_session')}</ResultLabel>
              <ResultValue>
                {t('chat.result_minutes', {
                  count: metrics.avgSessionDurationMin,
                  value: metrics.avgSessionDurationMin.toFixed(1),
                })}
              </ResultValue>
            </ResultRow>
          )}
          {typeof metrics.bounceRate === 'number' && (
            <ResultRow>
              <ResultLabel>{t('chat.result_bounce_rate')}</ResultLabel>
              <ResultValue>
                {(metrics.bounceRate * 100).toFixed(0)}%
              </ResultValue>
            </ResultRow>
          )}
          {typeof metrics.revenue === 'number' && metrics.revenue > 0 && (
            <ResultRow>
              <ResultLabel>{t('chat.result_revenue')}</ResultLabel>
              <ResultValue>${metrics.revenue.toFixed(2)}</ResultValue>
            </ResultRow>
          )}
        </div>
      )}
      {dashboard_url && (
        <a
          href={dashboard_url}
          target="_blank"
          rel="noopener noreferrer"
          className="block px-3 py-1.5 text-sm text-muted-foreground hover:underline"
        >
          {t('chat.result_open_profile')}
        </a>
      )}
    </ResultCard>
  );
}
