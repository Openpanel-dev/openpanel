'use client';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { FilterIcon } from 'lucide-react';
import { Options as NuqsOptions } from 'nuqs';

import { OverviewFiltersDrawerContent } from './overview-filters-drawer-content';

interface OverviewFiltersDrawerProps {
  projectId: string;
  nuqsOptions?: NuqsOptions;
}

export function OverviewFiltersDrawer({
  projectId,
  nuqsOptions,
}: OverviewFiltersDrawerProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" responsive icon={FilterIcon}>
          Filters
        </Button>
      </SheetTrigger>
      <SheetContent className="!max-w-lg w-full" side="right">
        <OverviewFiltersDrawerContent
          projectId={projectId}
          nuqsOptions={nuqsOptions}
        />
      </SheetContent>
    </Sheet>
  );
}
