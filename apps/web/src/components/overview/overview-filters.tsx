'use client';

import { api } from '@/app/_trpc/client';
import { useAppParams } from '@/hooks/useAppParams';
import { cn } from '@/utils/cn';

import { Combobox } from '../ui/combobox';
import { Label } from '../ui/label';
import { useOverviewOptions } from './useOverviewOptions';

export function OverviewFilters() {
  const { projectId } = useAppParams();
  const options = useOverviewOptions();

  const { data: referrers } = api.chart.values.useQuery({
    projectId,
    property: 'referrer',
    event: 'session_start',
  });

  const { data: devices } = api.chart.values.useQuery({
    projectId,
    property: 'device',
    event: 'session_start',
  });

  const { data: pages } = api.chart.values.useQuery({
    projectId,
    property: 'path',
    event: 'screen_view',
  });

  return (
    <div>
      <h2 className="text-xl font-medium mb-8">Overview filters</h2>
      <div className="flex flex-col gap-4">
        <div>
          <Label className="flex justify-between">
            Referrer
            <button
              className={cn(
                'text-slate-500 transition-opacity opacity-100',
                options.referrer === null && 'opacity-0'
              )}
              onClick={() => options.setReferrer(null)}
            >
              Reset
            </button>
          </Label>
          <Combobox
            className="w-full"
            onChange={(value) => options.setReferrer(value)}
            label="Referrer"
            placeholder="Referrer"
            items={
              referrers?.values?.filter(Boolean)?.map((value) => ({
                value,
                label: value,
              })) ?? []
            }
            value={options.referrer}
          />
        </div>
        <div>
          <Label className="flex justify-between">
            Device
            <button
              className={cn(
                'opacity-100 text-slate-500 transition-opacity',
                options.device === null && 'opacity-0'
              )}
              onClick={() => options.setDevice(null)}
            >
              Reset
            </button>
          </Label>
          <Combobox
            className="w-full"
            onChange={(value) => options.setDevice(value)}
            label="Device"
            placeholder="Device"
            items={
              devices?.values?.filter(Boolean)?.map((value) => ({
                value,
                label: value,
              })) ?? []
            }
            value={options.device}
          />
        </div>
        <div>
          <Label className="flex justify-between">
            Page
            <button
              className={cn(
                'opacity-100 text-slate-500 transition-opacity',
                options.page === null && 'opacity-0'
              )}
              onClick={() => options.setPage(null)}
            >
              Reset
            </button>
          </Label>
          <Combobox
            className="w-full"
            onChange={(value) => options.setPage(value)}
            label="Page"
            placeholder="Page"
            items={
              pages?.values?.filter(Boolean)?.map((value) => ({
                value,
                label: value,
              })) ?? []
            }
            value={options.page}
          />
        </div>
      </div>
    </div>
  );
}
