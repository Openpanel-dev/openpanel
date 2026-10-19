import type { ChatToolContext } from '../context';
import { analyticsTools } from './analytics';
import { chartTools } from './charts';
import { clientTools } from './client-tools';
import { dashboardTools } from './dashboards';
import { discoveryTools } from './discovery';
import { docsTools } from './docs';
import { entityTools } from './entities';
import { referenceTools } from './references';
import { searchTools } from './search';
import { seoTools } from './seo';

/** One tool set per turn; every tool closes over the checked context. */
export function createChatTools(ctx: ChatToolContext) {
  return {
    ...discoveryTools(ctx),
    ...analyticsTools(ctx),
    ...chartTools(ctx),
    ...searchTools(ctx),
    ...entityTools(ctx),
    ...referenceTools(ctx),
    ...seoTools(ctx),
    ...dashboardTools(ctx),
    ...docsTools(),
    ...clientTools(),
  };
}

export type ChatTools = ReturnType<typeof createChatTools>;

/** Writes wait for the user to confirm in the chat. */
export const CHAT_TOOL_APPROVAL = {
  create_dashboard: 'user-approval',
  save_chart: 'user-approval',
  create_reference: 'user-approval',
  create_client: 'user-approval',
  invite_member: 'user-approval',
  update_project: 'user-approval',
} as const satisfies Partial<Record<keyof ChatTools, 'user-approval'>>;
