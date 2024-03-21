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
        <div className="flex gap-2 items-center cursor-pointer">
          {report.name}
          <Pencil size={16} />
        </div>
      }
    >
      <ReportEditor report={report} />
    </PageLayout>
  );
}
