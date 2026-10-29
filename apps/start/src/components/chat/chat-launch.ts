import { useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { usePageContextRef } from '@/contexts/page-context';
import { useAppParams } from '@/hooks/use-app-params';

// A question the user asked inside the app is sent on arrival. It is handed
// over in memory, not in the URL, so a crafted link can only prefill one.
// Bound to its project: a launch whose chat never opened must not be sent in
// another project's chat later.
let launchedQuestion: { projectId: string; question: string } | null = null;

/** Call right before navigating to the chat page. */
export function setLaunchedQuestion(
  projectId: string,
  question?: string
): void {
  const text = question?.trim();
  launchedQuestion = text ? { projectId, question: text } : null;
}

export function takeLaunchedQuestion(projectId: string): string | null {
  const pending = launchedQuestion;
  if (pending?.projectId !== projectId) {
    return null;
  }
  launchedQuestion = null;
  return pending.question;
}

/** Opens the chat page; the page the user came from travels in `hint`. */
export function useChatLaunch() {
  const navigate = useNavigate();
  const { organizationId, projectId } = useAppParams();
  const hintRef = usePageContextRef();

  return useCallback(
    (question?: string) => {
      setLaunchedQuestion(projectId, question);
      navigate({
        to: '/$organizationId/$projectId/chat',
        params: { organizationId, projectId },
        search: { hint: hintRef.current ?? undefined },
      });
    },
    [navigate, organizationId, projectId, hintRef]
  );
}
