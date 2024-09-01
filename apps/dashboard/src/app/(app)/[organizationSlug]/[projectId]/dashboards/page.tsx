import ListDashboardsServer from './list-dashboards';

interface PageProps {
  params: {
    projectId: string;
  };
}

export default function Page({ params: { projectId } }: PageProps) {
  return <ListDashboardsServer projectId={projectId} />;
}
