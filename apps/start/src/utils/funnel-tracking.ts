import { useCallback, useRef } from 'react';
import { op } from '@/utils/op';

/**
 * Everything the sign-up → first-event funnel reports about itself, so the
 * flow can be judged on data later. One name per decision a visitor makes;
 * properties say which option they picked and how long the step took.
 *
 * Funnel order: auth_page_viewed → auth_provider_clicked →
 * auth_signup_succeeded | auth_signin_succeeded → onboarding_project_viewed →
 * onboarding_project_created → onboarding_connect_viewed →
 * onboarding_first_event_verified | onboarding_skipped →
 * onboarding_dashboard_opened. Everything else explains the gaps.
 */
export type FunnelEvent =
  | 'auth_page_viewed'
  | 'auth_provider_clicked'
  | 'auth_form_invalid'
  | 'auth_signup_succeeded'
  | 'auth_signup_failed'
  | 'auth_signin_succeeded'
  | 'auth_signin_failed'
  | 'auth_forgot_password_clicked'
  | 'onboarding_project_viewed'
  | 'onboarding_workspace_mode_changed'
  | 'onboarding_workspace_settings_toggled'
  | 'onboarding_project_type_toggled'
  | 'onboarding_extra_domains_toggled'
  | 'onboarding_project_invalid'
  | 'onboarding_project_created'
  | 'onboarding_project_create_failed'
  | 'onboarding_connect_viewed'
  | 'onboarding_install_method_selected'
  | 'onboarding_framework_selected'
  | 'onboarding_frameworks_show_all_toggled'
  | 'onboarding_framework_guide_clicked'
  | 'onboarding_snippet_copied'
  | 'onboarding_ai_framework_selected'
  | 'onboarding_ai_prompt_copied'
  | 'onboarding_ai_prompt_opened_in_cursor'
  | 'onboarding_credentials_copied'
  | 'onboarding_mcp_connect_clicked'
  | 'onboarding_mcp_settings_clicked'
  | 'onboarding_troubleshooting_toggled'
  | 'onboarding_allowed_domains_updated'
  | 'onboarding_test_curl_copied'
  | 'onboarding_support_link_clicked'
  | 'onboarding_first_event_verified'
  | 'onboarding_skipped'
  | 'onboarding_dashboard_opened'
  | 'onboarding_signed_out';

export type FunnelProperties = Record<
  string,
  string | number | boolean | null | undefined | string[]
>;

export function trackFunnel(name: FunnelEvent, properties?: FunnelProperties) {
  op.track(name, properties);
}

/** Seconds since the step mounted, attached to the events that end a step. */
export function useSecondsOnStep() {
  const mountedAt = useRef(Date.now());
  return useCallback(
    () => Math.round((Date.now() - mountedAt.current) / 1000),
    []
  );
}

/** The error text when the API refused, trimmed so it groups in reports. */
export function failureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 80);
}
