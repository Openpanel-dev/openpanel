import { useParams } from '@tanstack/react-router';

export function useAppParams() {
  const params = useParams({
    strict: false,
  });
  return params as {
    organizationId: string;
    projectId: string;
  };
}
