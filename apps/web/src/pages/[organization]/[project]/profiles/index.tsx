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
import Link from "next/link";
import { useMemo } from "react";

const columnHelper =
  createColumnHelper<RouterOutputs["profile"]["list"][number]>();

export default function Events() {
  const pagination = usePagination();
  const params = useOrganizationParams();
  const eventsQuery = api.profile.list.useQuery(
    {
      projectSlug: params.project,
      ...pagination,
    },
    {
      keepPreviousData: true,
    },
  );
  const profiles = useMemo(() => eventsQuery.data ?? [], [eventsQuery]);
  const columns = useMemo(() => {
    return [
      columnHelper.accessor((row) => row.createdAt, {
        id: "createdAt",
        header: () => "Created At",
        cell(info) {
          return formatDateTime(info.getValue());
        },
      }),
      columnHelper.accessor('first_name', {
        id: "name",
        header: () => "Name",
        cell(info) {
          const profile = info.row.original;
          return (
            <Link href={`/${params.organization}/${params.project}/profiles/${profile?.id}`} className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                {profile?.avatar && <AvatarImage src={profile.avatar} />}
                <AvatarFallback className="text-xs">
                  {profile?.first_name?.at(0)}
                </AvatarFallback>
              </Avatar>
              {`${profile?.first_name} ${profile?.last_name ?? ""}`}
            </Link>
          );
        },
      }),
      columnHelper.accessor((row) => row.properties, {
        id: "properties",
        header: () => "Properties",
        cell(info) {
          const dots = toDots(info.getValue() as Record<string, any>);
          if(Object.keys(dots).length === 0) return 'No properties';
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
      }),
    ];
  }, []);
  return (
    <MainLayout>
      <Container>
        <PageTitle>Profiles</PageTitle>
        <Pagination {...pagination} />
        <DataTable data={profiles} columns={columns}></DataTable>
        <Pagination {...pagination} />
      </Container>
    </MainLayout>
  );
}
