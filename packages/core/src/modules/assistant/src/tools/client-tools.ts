import { tool } from 'ai';
import { z } from 'zod';
import {
  CHAT_DIALOGS,
  CHAT_ROUTES,
  zNavigateInput,
  zOpenDialogInput,
} from '../../assistant.constants';

function catalog(
  entries: Record<string, { label: string; description: string }>
) {
  return Object.entries(entries)
    .map(([key, entry]) => `\`${key}\`: ${entry.label}. ${entry.description}`)
    .join('\n');
}

/** Run in the browser: no `execute`, the dashboard reports back. */
export function clientTools() {
  return {
    navigate: tool({
      description: `Offer the user a link to a page in the dashboard; it renders as a button they can press. Use it when they ask where something is or how to change a setting. Routes:\n${catalog(CHAT_ROUTES)}`,
      inputSchema: zNavigateInput,
      outputSchema: z.object({ opened: z.string() }),
    }),
    open_dialog: tool({
      description: `Offer the user a button that opens a creation dialog, prefilled where possible, so they only have to press save. Say what the dialog is for before offering it. Dialogs:\n${catalog(CHAT_DIALOGS)}`,
      inputSchema: zOpenDialogInput,
      outputSchema: z.object({ opened: z.string() }),
    }),
  };
}
