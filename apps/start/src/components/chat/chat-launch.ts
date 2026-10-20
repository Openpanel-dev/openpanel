import { useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { usePageContextRef } from '@/contexts/page-context';
import { useAppParams } from '@/hooks/use-app-params';

/**
 * Opens the chat page. A question travels in `q` and is sent on arrival; the
 * page the user came from travels in `hint`.
 */
export function useChatLaunch() {
  const navigate = useNavigate();
  const { organizationId, projectId } = useAppParams();
  const hintRef = usePageContextRef();

  return useCallback(
    (question?: string) => {
      const text = question?.trim();
      navigate({
        to: '/$organizationId/$projectId/chat',
        params: { organizationId, projectId },
        search: {
          q: text || undefined,
          hint: hintRef.current ?? undefined,
        },
      });
    },
    [navigate, organizationId, projectId, hintRef]
  );
}
