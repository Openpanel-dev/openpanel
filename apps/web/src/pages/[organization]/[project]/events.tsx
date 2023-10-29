import { Container } from "@/components/Container";
import { DataTable } from "@/components/DataTable";
import { PageTitle } from "@/components/PageTitle";
import { Pagination, usePagination } from "@/components/Pagination";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { useOrganizationParams } from "@/hooks/useOrganizationParams";
import { type RouterOutputs, api } from "@/utils/api";
import { formatDateTime } from "@/utils/date";
import { toDots } from "@/utils/object";
import { AvatarImage } from "@radix-ui/react-avatar";
import { createColumnHelper } from "@tanstack/react-table";
import { useMemo } from "react";

const columnHelper =
  createColumnHelper<RouterOutputs["event"]["list"][number]>();

export default function Events() {
  const pagination = usePagination();
  const params = useOrganizationParams();
  const eventsQuery = api.event.list.useQuery(
    {
      projectSlug: params.project,
      ...pagination,
    },
    {
      keepPreviousData: true,
    },
  );
  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery]);
  const columns = useMemo(() => {
    return [
      columnHelper.accessor((row) => row.createdAt, {
        id: "createdAt",
        header: () => "Created At",
        cell(info) {
          return formatDateTime(info.getValue());
        },
        footer: () => "Created At",
      }),
      columnHelper.accessor((row) => row.name, {
        id: "event",
        header: () => "Event",
        cell(info) {
          return <span className="font-medium">{info.getValue()}</span>;
        },
        footer: () => "Created At",
      }),
      columnHelper.accessor((row) => row.profile, {
        id: "profile",
        header: () => "Profile",
        cell(info) {
          const profile = info.getValue();
          return (
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                {profile?.avatar && <AvatarImage src={profile.avatar} />}
                <AvatarFallback className="text-xs">
                  {profile?.first_name?.at(0)}
                </AvatarFallback>
              </Avatar>
              {`${profile?.first_name} ${profile?.last_name ?? ""}`}
            </div>
          );
        },
        footer: () => "Created At",
      }),
      columnHelper.accessor((row) => row.properties, {
        id: "properties",
        header: () => "Properties",
        cell(info) {
          const dots = toDots(info.getValue() as Record<string, any>);
          return (
            <Table className="mini">
              <TableBody>
                {Object.keys(dots).map((key) => {
                  return (
                    <TableRow key={key}>
                      <TableCell className="font-medium">{key}</TableCell>
                      <TableCell>
                        {typeof dots[key] === "boolean"
                          ? dots[key]
                            ? "true"
                            : "false"
                          : dots[key]}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          );
        },
        footer: () => "Created At",
      }),
    ];
  }, []);
  return (
    <MainLayout>
      <Container>
        <PageTitle>Events</PageTitle>
        <Pagination {...pagination} />
        <DataTable data={events} columns={columns}></DataTable>
        <Pagination {...pagination} />
      </Container>
    </MainLayout>
  );
}
