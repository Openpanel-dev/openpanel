import { useParams } from 'next/navigation';

type AppParams = {
  organizationSlug: string;
  projectId: string;
};

export function useAppParams<T>() {
  const params = useParams<T & AppParams>();
  return {
    ...(params ?? {}),
    organizationSlug: params?.organizationSlug,
    projectId: params?.projectId,
  } as T & AppParams;
}
