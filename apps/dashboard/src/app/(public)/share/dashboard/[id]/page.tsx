import { ShareEnterPassword } from '@/components/auth/share-enter-password';
import { ReportChart } from '@/components/report-chart';
import {
  getOrganizationById,
  getReportsByDashboardId,
  getShareDashboardById,
} from '@openpanel/db';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

interface PageProps {
  params: {
    id: string;
  };
  searchParams: {
    header: string;
  };
}

export default async function Page({
  params: { id },
  searchParams,
}: PageProps) {
  const share = await getShareDashboardById(id);
  if (!share) {
    return notFound();
  }
  if (!share.public) {
    return notFound();
  }
  const dashboardId = share.dashboardId;
  const organization = await getOrganizationById(share.organizationId);

  if (share.password) {
    const cookie = cookies().get(`shared-dashboard-${share.id}`)?.value;
    if (!cookie) {
      return <ShareEnterPassword shareId={share.id} type="dashboard" />;
    }
  }

  const reports = await getReportsByDashboardId(dashboardId);

  return (
    <div>
      {searchParams.header !== '0' && (
        <div className="flex items-center justify-between border-b border-border bg-background p-4">
          <div className="col gap-1">
            <span className="text-sm">{organization?.name}</span>
            <h1 className="text-xl font-medium">{share.dashboard?.name}</h1>
          </div>
          <a
            href="https://openpanel.dev?utm_source=openpanel.dev&utm_medium=share"
            className="col gap-1 items-end"
          >
            <span className="text-xs">POWERED BY</span>
            <span className="text-xl font-medium">openpanel.dev</span>
          </a>
        </div>
      )}
      <div className="p-4">
        {reports.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No reports in this dashboard
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reports.map((report) => (
              <div key={report.id} className="card p-4">
                <div className="font-medium mb-4">{report.name}</div>
                <ReportChart report={report} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
