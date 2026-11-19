import type { ServiceDeps, Services } from '../../services';
import { type RunChatInput, runChat } from './src/chat';
import {
  type FilterCommandInput,
  runFilterCommand,
} from './src/filter-command';
import {
  type ReportDraftInput,
  type ReportDraftResult,
  runReportDraft,
} from './src/report-draft';

export type { FilterCommandResult } from './src/filter-command';
export type { AssistantUIMessage, AssistantUIMessagePart } from './src/message';
export type { ReportDraft, ReportDraftResult } from './src/report-draft';

export function createAssistantService(
  deps: ServiceDeps,
  _services: () => Services
) {
  return {
    runChat: (input: RunChatInput): Promise<Response> => runChat(deps, input),
    runFilterCommand: (
      input: FilterCommandInput
    ): ReturnType<typeof runFilterCommand> => runFilterCommand(deps, input),
    draftReport: (input: ReportDraftInput): Promise<ReportDraftResult> =>
      runReportDraft(deps, input),
  };
}
