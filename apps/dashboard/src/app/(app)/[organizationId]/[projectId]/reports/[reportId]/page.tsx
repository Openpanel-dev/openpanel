import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';
import { getExists } from '@/server/pageExists';
import { getOrganizationBySlug, getReportById } from '@openpanel/db';
import { Pencil } from 'lucide-react';
import { notFound } from 'next/navigation';

import ReportEditor from '../report-editor';

interface PageProps {
  params: {
    projectId: string;
    reportId: string;
    organizationId: string;
  };
}

export default async function Page({
  params: { reportId, organizationId, projectId },
}: PageProps) {
  const [report] = await Promise.all([
    getReportById(reportId),
    getExists(organizationId, projectId),
  ]);

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
