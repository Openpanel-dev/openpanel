'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ModalHeader } from '@/modals/Modal/Container';
import { api, handleError } from '@/trpc/client';
import { TIMEZONES } from '@openpanel/common';
import type { IServiceOrganization } from '@openpanel/db';
import { toast } from 'sonner';

interface SideEffectsProps {
  organization: IServiceOrganization;
}

export default function SideEffectsTimezone({
  organization,
}: SideEffectsProps) {
  const [isMissingTimezone, setIsMissingTimezone] = useState<boolean>(
    !organization.timezone,
  );
  const defaultTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [timezone, setTimezone] = useState<string>(
    TIMEZONES.includes(defaultTimezone) ? defaultTimezone : '',
  );

  const mutation = api.organization.update.useMutation({
    onSuccess(res) {
      toast('Timezone updated', {
        description: 'Your timezone has been updated.',
      });
      window.location.reload();
    },
    onError: handleError,
  });

  return (
    <Dialog open={isMissingTimezone} onOpenChange={setIsMissingTimezone}>
      <DialogContent
        className="max-w-xl"
        onEscapeKeyDown={(e) => {
          e.preventDefault();
        }}
        onInteractOutside={(e) => {
          e.preventDefault();
        }}
      >
        <ModalHeader
          onClose={false}
          title="Select your timezone"
          text={
            <>
              We have introduced new features that requires your timezone.
              Please select the timezone you want to use for your organization.
            </>
          }
        />
        <Combobox
          items={TIMEZONES.map((item) => ({
            value: item,
            label: item,
          }))}
          value={timezone}
          onChange={setTimezone}
          placeholder="Select a timezone"
          searchable
          size="lg"
          className="w-full px-4"
        />
        <DialogFooter className="mt-4">
          <Button
            size="lg"
            disabled={!TIMEZONES.includes(timezone)}
            loading={mutation.isLoading}
            onClick={() =>
              mutation.mutate({
                id: organization.id,
                name: organization.name,
                timezone: timezone ?? '',
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
