import { useParams } from 'next/navigation';

type AppParamsIn = {
  organizationId: string;
  projectId: string;
};
type AppParamsOut = {
  organizationSlug: string;
  projectId: string;
};

export function useAppParams<T>() {
  const params = useParams<T & AppParamsIn>();
  return {
    ...(params ?? {}),
    organizationSlug: params?.organizationId,
    projectId: params?.projectId,
  } as T & AppParamsOut;
}
