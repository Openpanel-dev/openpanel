'use client';

import { api } from '@/app/_trpc/client';
import { useAppParams } from '@/hooks/useAppParams';
import { cn } from '@/utils/cn';
import { X } from 'lucide-react';

import { Button } from '../ui/button';
import { Combobox } from '../ui/combobox';
import { Label } from '../ui/label';
import { useOverviewOptions } from './useOverviewOptions';

export function OverviewFiltersButtons() {
  const options = useOverviewOptions();
  return (
    <>
      {options.referrer && (
        <Button
          size="sm"
          variant="ghost"
          icon={X}
          onClick={() => options.setReferrer(null)}
        >
          {options.referrer}
        </Button>
      )}
      {options.device && (
        <Button
          size="sm"
          variant="ghost"
          icon={X}
          onClick={() => options.setDevice(null)}
        >
          {options.device}
        </Button>
      )}
      {options.page && (
        <Button
          size="sm"
          variant="ghost"
          icon={X}
          onClick={() => options.setPage(null)}
        >
          {options.page}
        </Button>
      )}
      {options.utmSource && (
        <Button
          size="sm"
          variant="ghost"
          icon={X}
          onClick={() => options.setUtmSource(null)}
        >
          {options.utmSource}
        </Button>
      )}
      {options.utmMedium && (
        <Button
          size="sm"
          variant="ghost"
          icon={X}
          onClick={() => options.setUtmMedium(null)}
        >
          {options.utmMedium}
        </Button>
      )}
      {options.utmCampaign && (
        <Button
          size="sm"
          variant="ghost"
          icon={X}
          onClick={() => options.setUtmCampaign(null)}
        >
          {options.utmCampaign}
        </Button>
      )}
      {options.utmTerm && (
        <Button
          size="sm"
          variant="ghost"
          icon={X}
          onClick={() => options.setUtmTerm(null)}
        >
          {options.utmTerm}
        </Button>
      )}
      {options.utmContent && (
        <Button
          size="sm"
          variant="ghost"
          icon={X}
          onClick={() => options.setUtmContent(null)}
        >
          {options.utmContent}
        </Button>
      )}
      {options.country && (
        <Button
          size="sm"
          variant="ghost"
          icon={X}
          onClick={() => options.setCountry(null)}
        >
          {options.country}
        </Button>
      )}
      {options.region && (
        <Button
          size="sm"
          variant="ghost"
          icon={X}
          onClick={() => options.setRegion(null)}
        >
          {options.region}
        </Button>
      )}
      {options.city && (
        <Button
          size="sm"
          variant="ghost"
          icon={X}
          onClick={() => options.setCity(null)}
        >
          {options.city}
        </Button>
      )}
    </>
  );
}
