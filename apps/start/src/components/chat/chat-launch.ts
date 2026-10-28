import { useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { usePageContextRef } from '@/contexts/page-context';
import { useAppParams } from '@/hooks/use-app-params';

// A question the user asked inside the app is sent on arrival. It is handed
// over in memory, not in the URL, so a crafted link can only prefill one.
let launchedQuestion: string | null = null;

/** Call right before navigating to the chat page. */
export function setLaunchedQuestion(question?: string): void {
  launchedQuestion = question?.trim() || null;
}

export function takeLaunchedQuestion(): string | null {
  const question = launchedQuestion;
  launchedQuestion = null;
  return question;
}

/** Opens the chat page; the page the user came from travels in `hint`. */
export function useChatLaunch() {
  const navigate = useNavigate();
  const { organizationId, projectId } = useAppParams();
  const hintRef = usePageContextRef();

  return useCallback(
    (question?: string) => {
      setLaunchedQuestion(question);
      navigate({
        to: '/$organizationId/$projectId/chat',
        params: { organizationId, projectId },
        search: { hint: hintRef.current ?? undefined },
      });
    },
    [navigate, organizationId, projectId, hintRef]
  );
}
