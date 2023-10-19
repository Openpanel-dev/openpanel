import { ReportLineChart } from "@/components/report/chart/ReportLineChart";
import { MainLayout } from "@/components/layouts/Main";
import { Container } from "@/components/Container";
import { api } from "@/utils/api";
import Link from "next/link";

export default function Home() {
  const reportsQuery = api.report.getDashboard.useQuery({
    projectId: 'f7eabf0c-e0b0-4ac0-940f-1589715b0c3d',
    dashboardId: '9227feb4-ad59-40f3-b887-3501685733dd',
  }, {
    staleTime: 1000 * 60 * 5,
  })
  const reports = reportsQuery.data ?? []

  return (
    <MainLayout className="bg-slate-50 py-8">
      <Container className="flex flex-col gap-8">
        {reports.map((report) => (
          <div
            className="rounded-xl border border-border bg-white shadow"
            key={report.id}
          >
            <Link href={`/reports/${report.id}`} className="block border-b border-border p-4 font-bold hover:underline">{report.name}</Link>
            <div className="p-4">
              <ReportLineChart {...report} showTable={false} />
            </div>
          </div>
        ))}
      </Container>
    </MainLayout>
  );
}
