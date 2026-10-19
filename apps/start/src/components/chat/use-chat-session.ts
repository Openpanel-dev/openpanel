import { useChat } from '@ai-sdk/react';
import type {
  ChatLaunchHint,
  NavigateInput,
  OpenDialogInput,
} from '@openpanel/core/modules/assistant/assistant.constants';
import { CHAT_ROUTES } from '@openpanel/core/modules/assistant/assistant.constants';
import type { IIntegrationConfig } from '@openpanel/core/modules/integration/integration.constants';
import { useQueryClient } from '@tanstack/react-query';
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
} from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssistantUIMessage } from './types';
import { useAppContext } from '@/hooks/use-app-context';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';

const CLIENT_TYPES = ['read', 'write', 'root'] as const;
const DEFAULT_INTEGRATION_TYPE = 'webhook';

function clientType(value: string | undefined) {
  return CLIENT_TYPES.find((type) => type === value);
}

/** Each dialog takes only the fields it has; anything else in the prefill is dropped. */
export function openDialog(input: OpenDialogInput): void {
  const prefill = input.prefill ?? {};
  switch (input.dialog) {
    case 'addClient':
      pushModal('AddClient', {
        name: prefill.name,
        type: clientType(prefill.type),
      });
      return;
    case 'addDashboard':
      pushModal('AddDashboard', { name: prefill.name });
      return;
    case 'addReference':
      pushModal('AddReference', {
        title: prefill.title,
        description: prefill.description,
        datetime: prefill.datetime ?? prefill.date,
      });
      return;
    case 'addNotificationRule':
      pushModal('AddNotificationRule', { rule: undefined });
      return;
    case 'addIntegration':
      pushModal('AddIntegration', {
        type: (prefill.type ??
          DEFAULT_INTEGRATION_TYPE) as IIntegrationConfig['type'],
      });
      return;
    case 'addProject':
      pushModal('AddProject');
      return;
    case 'inviteMember':
      pushModal('CreateInvite');
      return;
    case 'addCohort':
      pushModal('AddCohort');
      return;
    default:
      return;
  }
}

function fillRoute(
  input: NavigateInput,
  ids: { organizationId: string; projectId: string }
): string {
  const route = CHAT_ROUTES[input.route];
  const base =
    'scope' in route && route.scope === 'organization'
      ? `/${ids.organizationId}`
      : `/${ids.organizationId}/${ids.projectId}`;
  const path = route.path.replace(/:([a-zA-Z]+)/g, (_match, key: string) =>
    encodeURIComponent(input.params?.[key] ?? '')
  );
  return `${base}${path}`;
}

export interface ChatSessionOptions {
  conversationId: string;
  initialMessages: AssistantUIMessage[];
  initialTitle: string | null;
  modelId: string | null;
  hint?: ChatLaunchHint;
}

/** One `useChat` wired to the API, the router, the modals and the conversation list. */
export function useChatSession(options: ChatSessionOptions) {
  const { apiUrl } = useAppContext();
  const { organizationId, projectId } = useAppParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState<string | null>(options.initialTitle);

  // Read at request time so a model switch mid-conversation applies to the next turn.
  const modelRef = useRef(options.modelId);
  modelRef.current = options.modelId;
  const hintRef = useRef(options.hint);
  hintRef.current = options.hint;

  const transport = useMemo(
    () =>
      new DefaultChatTransport<AssistantUIMessage>({
        api: `${apiUrl}/ai/chat`,
        credentials: 'include',
        prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) => ({
          body: {
            id,
            projectId,
            organizationId,
            modelId: modelRef.current ?? undefined,
            trigger,
            messageId,
            message: messages.at(-1),
            hint: hintRef.current,
          },
        }),
      }),
    [apiUrl, projectId, organizationId]
  );

  const invalidateList = useCallback(() => {
    queryClient.invalidateQueries(trpc.conversation.list.pathFilter());
  }, [queryClient, trpc]);

  const chat = useChat<AssistantUIMessage>({
    id: options.conversationId,
    messages: options.initialMessages,
    transport,
    sendAutomaticallyWhen: (state) =>
      lastAssistantMessageIsCompleteWithToolCalls(state) ||
      lastAssistantMessageIsCompleteWithApprovalResponses(state),
    onToolCall: ({ toolCall }) => {
      if (toolCall.dynamic) {
        return;
      }
      if (toolCall.toolName === 'navigate') {
        const input = toolCall.input as NavigateInput;
        // Offered as a link, not followed: moving away mid-answer loses the answer.
        chat.addToolOutput({
          tool: 'navigate',
          toolCallId: toolCall.toolCallId,
          output: { opened: fillRoute(input, { organizationId, projectId }) },
        });
        return;
      }
      if (toolCall.toolName === 'open_dialog') {
        const input = toolCall.input as OpenDialogInput;
        // Offered as a button, not opened: a dialog appearing mid-answer is confusing.
        chat.addToolOutput({
          tool: 'open_dialog',
          toolCallId: toolCall.toolCallId,
          output: { opened: input.dialog },
        });
      }
    },
    onData: (part) => {
      if (part.type === 'data-title') {
        setTitle(part.data.title);
      }
    },
    onFinish: invalidateList,
  });

  useEffect(() => {
    setTitle(options.initialTitle);
  }, [options.initialTitle]);

  return { ...chat, title, invalidateList };
}

export type ChatSession = ReturnType<typeof useChatSession>;
