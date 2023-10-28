import { MainLayout } from "@/components/layouts/MainLayout";
import { Container } from "@/components/Container";
import { api } from "@/utils/api";
import Link from "next/link";
import { PageTitle } from "@/components/PageTitle";
import { useOrganizationParams } from "@/hooks/useOrganizationParams";
import { Suspense, useMemo } from "react";
import { createServerSideProps } from "@/server/getServerSideProps";
import { Chart } from "@/components/report/chart";
import { timeRanges } from "@/utils/constants";

export const getServerSideProps = createServerSideProps()

export default function Dashboard() {
  const params = useOrganizationParams();

  const query = api.report.list.useQuery({
    projectSlug: params.project,
    dashboardSlug: params.dashboard,
  });
  
  const dashboard = query.data?.dashboard ?? null;
  const reports = useMemo(() => {
    return query.data?.reports ?? [];
  }, [query])

  return (
    <MainLayout>
      <Container>
        <Suspense fallback="Loading">
          <PageTitle>{dashboard?.name}</PageTitle>
          <div className="grid grid-cols-2 gap-4">
            {reports.map((report) => {
              const range = timeRanges.find((item) => item.range === report.range)
              return (
                <div
                  className="rounded-md border border-border bg-white shadow"
                  key={report.id}
                >
                  <Link
                    href={`/${params.organization}/reports/${report.id}`}
                    className="block border-b border-border p-4 leading-none hover:underline"
                  >
                    <div className="font-medium">{report.name}</div>
                    {range && <div className="text-sm mt-2">{range.title}</div>}
                  </Link>
                  <div className="p-4 pl-2 aspect-[1.8/1] overflow-auto">
                    <Chart {...report} editMode={false} />
                  </div>
                </div>
              )
            })}
          </div>
        </Suspense>
      </Container>
    </MainLayout>
  );
}
