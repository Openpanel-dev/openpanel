import { useParams } from 'next/navigation';

type AppParams = {
  organizationId: string;
  projectId: string;
};

export function useAppParams<T>() {
  const params = useParams<T & AppParams & { organizationSlug: string }>();
  return {
    ...(params ?? {}),
    organizationId: params?.organizationSlug,
    projectId: params?.projectId,
  } as T & AppParams;
}
