'use client';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { FilterIcon } from 'lucide-react';

import type { OverviewFiltersDrawerContentProps } from './overview-filters-drawer-content';
import { OverviewFiltersDrawerContent } from './overview-filters-drawer-content';

export function OverviewFiltersDrawer(
  props: OverviewFiltersDrawerContentProps
) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" responsive icon={FilterIcon}>
          Filters
        </Button>
      </SheetTrigger>
      <SheetContent className="!max-w-lg w-full" side="right">
        <OverviewFiltersDrawerContent {...props} />
      </SheetContent>
    </Sheet>
  );
}
