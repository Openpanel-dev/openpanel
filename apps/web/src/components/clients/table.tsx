import { formatDate } from "@/utils/date";
import { type ColumnDef } from "@tanstack/react-table";
import { type IClientWithProject } from "@/types";
import { ClientActions } from "./ClientActions";

export const columns: ColumnDef<IClientWithProject>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => {
      return (
        <div>
          <div>{row.original.name}</div>
          <div className="text-sm text-muted-foreground">
            {row.original.project.name}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "id",
    header: "Client ID",
  },
  {
    accessorKey: "secret",
    header: "Secret",
    cell: () => <div className="italic text-muted-foreground">Hidden</div>,
  },
  {
    accessorKey: "createdAt",
    header: "Created at",
    cell({ row }) {
      const date = row.original.createdAt;
      return <div>{formatDate(date)}</div>;
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => <ClientActions {...row.original} />,
  },
];
