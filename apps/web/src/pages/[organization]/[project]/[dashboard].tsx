import { ReportLineChart } from "@/components/report/chart/ReportLineChart";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Container } from "@/components/Container";
import { api } from "@/utils/api";
import Link from "next/link";
import { PageTitle } from "@/components/PageTitle";
import { useOrganizationParams } from "@/hooks/useOrganizationParams";
import { Suspense } from "react";
import { createServerSideProps } from "@/server/getServerSideProps";

export const getServerSideProps = createServerSideProps()

export default function Dashboard() {
  const params = useOrganizationParams();

  const query = api.report.list.useQuery({
    projectSlug: params.project,
    dashboardSlug: params.dashboard,
  });
  
  const dashboard = query.data?.dashboard ?? null;
  const reports = query.data?.reports ?? [];

  return (
    <MainLayout>
      <Container>
        <Suspense fallback="Loading">
          <PageTitle>{dashboard?.name}</PageTitle>
          <div className="grid grid-cols-2 gap-4">
            {reports.map((report) => (
              <div
                className="rounded-md border border-border bg-white shadow"
                key={report.id}
              >
                <Link
                  href={`/${params.organization}/reports/${report.id}`}
                  className="block border-b border-border p-4 font-medium leading-none hover:underline"
                >
                  {report.name}
                </Link>
                <div className="p-4 pl-2">
                  <ReportLineChart {...report} showTable={false} />
                </div>
              </div>
            ))}
          </div>
        </Suspense>
      </Container>
    </MainLayout>
  );
}
