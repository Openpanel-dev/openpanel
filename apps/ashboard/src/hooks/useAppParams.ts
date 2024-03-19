import { useParams } from 'next/navigation';

// eslint-disable-next-line
type AppParams = {
  organizationId: string;
  projectId: string;
};

export function useAppParams<T>() {
  const params = useParams<T & AppParams>();
  return {
    ...(params ?? {}),
    organizationId: params?.organizationId,
    projectId: params?.projectId,
  } as T & AppParams;
}
