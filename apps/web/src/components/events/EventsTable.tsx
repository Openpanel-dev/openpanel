import { useMemo } from 'react';
import { DataTable } from '@/components/DataTable';
import { Pagination } from '@/components/Pagination';
import type { PaginationProps } from '@/components/Pagination';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { useOrganizationParams } from '@/hooks/useOrganizationParams';
import type { RouterOutputs } from '@/utils/api';
import { formatDateTime } from '@/utils/date';
import { toDots } from '@/utils/object';
import { AvatarImage } from '@radix-ui/react-avatar';
import { createColumnHelper } from '@tanstack/react-table';
import Link from 'next/link';

const columnHelper =
  createColumnHelper<RouterOutputs['event']['list'][number]>();

interface EventsTableProps {
  data: RouterOutputs['event']['list'];
  pagination: PaginationProps;
}

export function EventsTable({ data, pagination }: EventsTableProps) {
  const params = useOrganizationParams();
  const columns = useMemo(() => {
    return [
      columnHelper.accessor((row) => row.createdAt, {
        id: 'createdAt',
        header: () => 'Created At',
        cell(info) {
          return formatDateTime(info.getValue());
        },
        footer: () => 'Created At',
      }),
      columnHelper.accessor((row) => row.name, {
        id: 'event',
        header: () => 'Event',
        cell(info) {
          return <span className="font-medium">{info.getValue()}</span>;
        },
        footer: () => 'Created At',
      }),
      columnHelper.accessor((row) => row.profile, {
        id: 'profile',
        header: () => 'Profile',
        cell(info) {
          const profile = info.getValue();
          return (
            <Link
              shallow
              href={`/${params.organization}/${params.project}/profiles/${profile?.id}`}
              className="flex items-center gap-2"
            >
              <Avatar className="h-6 w-6">
                {profile?.avatar && <AvatarImage src={profile.avatar} />}
                <AvatarFallback className="text-xs">
                  {profile?.first_name?.at(0)}
                </AvatarFallback>
              </Avatar>
              {`${profile?.first_name} ${profile?.last_name ?? ''}`}
            </Link>
          );
        },
        footer: () => 'Created At',
      }),
      columnHelper.accessor((row) => row.properties, {
        id: 'properties',
        header: () => 'Properties',
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
                        {typeof dots[key] === 'boolean'
                          ? dots[key]
                            ? 'true'
                            : 'false'
                          : dots[key]}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          );
        },
        footer: () => 'Created At',
      }),
    ];
  }, [params]);

  return (
    <>
      <Pagination {...pagination} />
      <DataTable data={data} columns={columns} />
      <Pagination {...pagination} />
    </>
  );
}
