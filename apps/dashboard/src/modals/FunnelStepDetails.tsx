'use client';

import { useEffect, useRef, useState } from 'react';
import { ListPropertiesIcon } from '@/components/events/list-properties-icon';
import { Pagination } from '@/components/pagination';
import { ProfileAvatar } from '@/components/profiles/profile-avatar';
import { DialogContent } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltiper } from '@/components/ui/tooltip';
import { WidgetTable } from '@/components/widget-table';
import { useAppParams } from '@/hooks/useAppParams';
import { api } from '@/trpc/client';
import { getProfileName } from '@/utils/getters';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { IChartInput } from '@openpanel/validation';

import { popModal } from '.';
import { ModalHeader } from './Modal/Container';

interface Props extends IChartInput {
  step: number;
}

function usePrevious(value: any) {
  const ref = useRef();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

export default function FunnelStepDetails(props: Props) {
  const [data] = api.chart.funnelStep.useSuspenseQuery(props);
  const pathname = usePathname();
  const prev = usePrevious(pathname);
  const { organizationSlug, projectId } = useAppParams();
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (prev && prev !== pathname) {
      popModal();
    }
  }, [pathname]);

  return (
    <DialogContent className="p-0">
      <div className="p-4">
        <ModalHeader title="Profiles"></ModalHeader>
        <Pagination
          count={data.length}
          take={50}
          cursor={page}
          setCursor={setPage}
        />
      </div>
      <ScrollArea className="max-h-[60vh]">
        <WidgetTable
          data={data.slice(page * 50, page * 50 + 50)}
          keyExtractor={(item) => item.id}
          columns={[
            {
              name: 'Name',
              render(profile) {
                return (
                  <Link
                    href={`/${organizationSlug}/${projectId}/profiles/${profile.id}`}
                    className="flex items-center gap-2 font-medium"
                  >
                    <ProfileAvatar size="sm" {...profile} />
                    {getProfileName(profile)}
                  </Link>
                );
              },
            },
            {
              name: '',
              render(profile) {
                return <ListPropertiesIcon {...profile.properties} />;
              },
            },
            {
              name: 'Last seen',
              render(profile) {
                return (
                  <Tooltiper
                    asChild
                    content={profile.createdAt.toLocaleString()}
                  >
                    <div className="text-sm text-muted-foreground">
                      {profile.createdAt.toLocaleTimeString()}
                    </div>
                  </Tooltiper>
                );
              },
            },
          ]}
        />
      </ScrollArea>
    </DialogContent>
  );
}
