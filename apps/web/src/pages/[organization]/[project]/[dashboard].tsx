import { MainLayout } from "@/components/layouts/MainLayout";
import { Container } from "@/components/Container";
import { api } from "@/utils/api";
import Link from "next/link";
import { PageTitle } from "@/components/PageTitle";
import { useOrganizationParams } from "@/hooks/useOrganizationParams";
import { Suspense, useMemo, useState } from "react";
import { createServerSideProps } from "@/server/getServerSideProps";
import { Chart } from "@/components/report/chart";
import { timeRanges } from "@/utils/constants";
import { type IChartRange } from "@/types";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { getRangeLabel } from "@/utils/getRangeLabel";

export const getServerSideProps = createServerSideProps();

export default function Dashboard() {
  const params = useOrganizationParams();

  const query = api.report.list.useQuery({
    projectSlug: params.project,
    dashboardSlug: params.dashboard,
  });

  const dashboard = query.data?.dashboard ?? null;
  const reports = useMemo(() => {
    return query.data?.reports ?? [];
  }, [query]);

  const [range, setRange] = useState<null | IChartRange>(null);

  return (
    <MainLayout>
      <Container>
        <Suspense fallback="Loading">
          <PageTitle>{dashboard?.name}</PageTitle>

          <RadioGroup className="mb-8">
            {timeRanges.map((item) => {
              return (
                <RadioGroupItem
                  key={item.range}
                  active={item.range === range}
                  onClick={() => {
                    setRange((p) => (p === item.range ? null : item.range));
                  }}
                >
                  {item.title}
                </RadioGroupItem>
              );
            })}
          </RadioGroup>

          <div className="grid grid-cols-2 gap-4">
            {reports.map((report) => {
              const chartRange = getRangeLabel(report.range);
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
                    {chartRange && (
                      <div className="mt-2 text-sm flex gap-2">
                        <span className={range ? "line-through" : ""}>{chartRange}</span>
                        {range && <span>{getRangeLabel(range)}</span>}
                      </div>
                    )}
                  </Link>
                  <div className="aspect-[1.8/1] overflow-auto p-4 pl-2">
                    <Chart
                      {...report}
                      range={range ?? report.range}
                      editMode={false}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Suspense>
      </Container>
    </MainLayout>
  );
}
