'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Widget, WidgetHead } from '@/components/widget';
import { api } from '@/trpc/client';
import { MoreHorizontalIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import type { IServiceMember, IServiceProject } from '@openpanel/db';

interface Props {
  members: IServiceMember[];
  projects: IServiceProject[];
}

const Members = ({ members, projects }: Props) => {
  return (
    <Widget>
      <WidgetHead className="flex items-center justify-between">
        <span className="title">Members</span>
      </WidgetHead>
      <Table className="mini">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Access</TableHead>
            <TableHead>More</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((item) => {
            return <Item {...item} projects={projects} key={item.id} />;
          })}
        </TableBody>
      </Table>
    </Widget>
  );
};

interface ItemProps extends IServiceMember {
  projects: IServiceProject[];
}

function Item({
  id,
  name,
  role,
  createdAt,
  organization,
  projects,
  access: prevAccess,
}: ItemProps) {
  const router = useRouter();
  const mutation = api.organization.updateMemberAccess.useMutation();
  const revoke = api.organization.removeMember.useMutation({
    onSuccess() {
      toast.success(`${name} has been removed from the organization`);
      router.refresh();
    },
    onError() {
      toast.error(`Failed to remove ${name} from the organization`);
    },
  });
  const [access, setAccess] = useState<string[]>(
    prevAccess.map((item) => item.projectId)
  );

  return (
    <TableRow key={id}>
      <TableCell className="font-medium">{name}</TableCell>
      <TableCell>{role}</TableCell>
      <TableCell>{new Date(createdAt).toLocaleString()}</TableCell>
      <TableCell>
        <ComboboxAdvanced
          placeholder="Restrict access to projects"
          value={access}
          onChange={(newAccess) => {
            setAccess(newAccess);
            mutation.mutate({
              userId: id!,
              organizationSlug: organization.slug,
              access: newAccess as string[],
            });
          }}
          items={projects.map((item) => ({
            label: item.name,
            value: item.id,
          }))}
        />
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button icon={MoreHorizontalIcon} size="icon" variant={'outline'} />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => {
                revoke.mutate({ organizationId: organization.id, userId: id! });
              }}
            >
              Remove member
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

export default Members;
