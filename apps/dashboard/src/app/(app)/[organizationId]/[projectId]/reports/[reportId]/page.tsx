import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';
import { Pencil } from 'lucide-react';
import { notFound } from 'next/navigation';

import { getReportById } from '@openpanel/db';

import ReportEditor from '../report-editor';

interface PageProps {
  params: {
    projectId: string;
    reportId: string;
    organizationId: string;
  };
}

export default async function Page({
  params: { reportId, organizationId },
}: PageProps) {
  const report = await getReportById(reportId);

  if (!report) {
    return notFound();
  }

  return (
    <PageLayout
      organizationSlug={organizationId}
      title={
        <div className="flex cursor-pointer items-center gap-2">
          {report.name}
          <Pencil size={16} />
        </div>
      }
    >
      <ReportEditor report={report} />
    </PageLayout>
  );
}
