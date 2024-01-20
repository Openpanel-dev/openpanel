'use client';

import { api, handleError } from '@/app/_trpc/client';
import { InputWithLabel } from '@/components/forms/InputWithLabel';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/components/ui/use-toast';
import { Widget, WidgetBody, WidgetHead } from '@/components/Widget';
import type { IServiceInvite } from '@/server/services/user.service';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const validator = z.object({
  email: z.string().email(),
});

type IForm = z.infer<typeof validator>;

interface InvitedUsersProps {
  invites: IServiceInvite[];
  organizationId: string;
}
export default function InvitedUsers({
  invites,
  organizationId,
}: InvitedUsersProps) {
  const router = useRouter();

  const { register, handleSubmit, formState, reset } = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      email: '',
    },
  });

  const mutation = api.user.invite.useMutation({
    onSuccess() {
      toast({
        title: 'User invited',
        description: "We have sent an invitation to the user's email",
      });
      reset();
      router.refresh();
    },
    onError: handleError,
  });

  return (
    <form
      onSubmit={handleSubmit((values) => {
        mutation.mutate({
          ...values,
          organizationId,
        });
      })}
    >
      <Widget>
        <WidgetHead className="flex items-center justify-between">
          <span className="title">Invites</span>
          <Button size="sm" type="submit" disabled={!formState.isDirty}>
            Invite
          </Button>
        </WidgetHead>
        <WidgetBody>
          <InputWithLabel
            label="Email"
            placeholder="Who do you want to invite?"
            {...register('email')}
          />

          <div className="font-medium mt-8 mb-2">Invited users</div>
          <Table className="mini">
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Accepted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.map((item) => {
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.email}</TableCell>
                    <TableCell>{item.accepted ? 'Yes' : 'No'}</TableCell>
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
    </form>
  );
}
