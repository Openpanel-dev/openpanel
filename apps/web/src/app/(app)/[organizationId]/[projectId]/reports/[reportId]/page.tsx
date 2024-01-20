import PageLayout from '@/app/(app)/page-layout';
import { getReportById } from '@/server/services/reports.service';
import { Pencil } from 'lucide-react';

import ReportEditor from '../report-editor';

interface PageProps {
  params: {
    organizationId: string;
    projectId: string;
    reportId: string;
  };
}

export default async function Page({
  params: { organizationId, reportId },
}: PageProps) {
  const report = await getReportById(reportId);
  return (
    <PageLayout
      title={
        <div className="flex gap-2 items-center cursor-pointer">
          {report.name}
          <Pencil size={16} />
        </div>
      }
      organizationId={organizationId}
    >
      <ReportEditor report={report} />
    </PageLayout>
  );
}
