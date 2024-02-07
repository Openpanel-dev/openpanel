'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Widget, WidgetBody, WidgetHead } from '@/components/Widget';
import type { IServiceInvites } from '@/server/services/organization.service';

import { InviteUser } from './invite-user';

interface InvitedUsersProps {
  invites: IServiceInvites;
}
export default function InvitedUsers({ invites }: InvitedUsersProps) {
  return (
    <Widget>
      <WidgetHead className="flex items-center justify-between">
        <span className="title">Invites</span>
      </WidgetHead>
      <WidgetBody>
        <InviteUser />

        <div className="font-medium mt-8 mb-2">Invited users</div>
        <Table className="mini">
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invites.map((item) => {
              return (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.email}</TableCell>
                  <TableCell>{item.role}</TableCell>
                  <TableCell>{item.status}</TableCell>
                  <TableCell>
                    {new Date(item.createdAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              );
            })}

            {invites.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} className="italic">
                  No invites
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </WidgetBody>
    </Widget>
  );
}
