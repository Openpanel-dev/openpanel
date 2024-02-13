'use client';

import { cn } from '@/utils/cn';
import { X } from 'lucide-react';

import { Button } from '../ui/button';
import { useOverviewOptions } from './useOverviewOptions';

export function OverviewFiltersButtons() {
  const options = useOverviewOptions();
  const activeFilter = options.filters.length > 0;

  return (
    <div className={cn('flex flex-wrap gap-2', activeFilter && 'px-4 pb-4')}>
      {options.referrer && (
        <Button
          size="sm"
          variant="outline"
          icon={X}
          onClick={() => options.setReferrer(null)}
        >
          <span className="mr-1">Referrer is</span>
          <strong>{options.referrer}</strong>
        </Button>
      )}
      {options.referrerName && (
        <Button
          size="sm"
          variant="outline"
          icon={X}
          onClick={() => options.setReferrerName(null)}
        >
          <span className="mr-1">Referrer name is</span>
          <strong>{options.referrerName}</strong>
        </Button>
      )}
      {options.referrerType && (
        <Button
          size="sm"
          variant="outline"
          icon={X}
          onClick={() => options.setReferrerType(null)}
        >
          <span className="mr-1">Referrer type is</span>
          <strong>{options.referrerType}</strong>
        </Button>
      )}
      {options.device && (
        <Button
          size="sm"
          variant="outline"
          icon={X}
          onClick={() => options.setDevice(null)}
        >
          <span className="mr-1">Device is</span>
          <strong>{options.device}</strong>
        </Button>
      )}
      {options.page && (
        <Button
          size="sm"
          variant="outline"
          icon={X}
          onClick={() => options.setPage(null)}
        >
          <span className="mr-1">Page is</span>
          <strong>{options.page}</strong>
        </Button>
      )}
      {options.utmSource && (
        <Button
          size="sm"
          variant="outline"
          icon={X}
          onClick={() => options.setUtmSource(null)}
        >
          <span className="mr-1">Utm Source is</span>
          <strong>{options.utmSource}</strong>
        </Button>
      )}
      {options.utmMedium && (
        <Button
          size="sm"
          variant="outline"
          icon={X}
          onClick={() => options.setUtmMedium(null)}
        >
          <span className="mr-1">Utm Medium is</span>
          <strong>{options.utmMedium}</strong>
        </Button>
      )}
      {options.utmCampaign && (
        <Button
          size="sm"
          variant="outline"
          icon={X}
          onClick={() => options.setUtmCampaign(null)}
        >
          <span className="mr-1">Utm Campaign is</span>
          <strong>{options.utmCampaign}</strong>
        </Button>
      )}
      {options.utmTerm && (
        <Button
          size="sm"
          variant="outline"
          icon={X}
          onClick={() => options.setUtmTerm(null)}
        >
          <span className="mr-1">Utm Term is</span>
          <strong>{options.utmTerm}</strong>
        </Button>
      )}
      {options.utmContent && (
        <Button
          size="sm"
          variant="outline"
          icon={X}
          onClick={() => options.setUtmContent(null)}
        >
          <span className="mr-1">Utm Content is</span>
          <strong>{options.utmContent}</strong>
        </Button>
      )}
      {options.country && (
        <Button
          size="sm"
          variant="outline"
          icon={X}
          onClick={() => options.setCountry(null)}
        >
          <span className="mr-1">Country is</span>
          <strong>{options.country}</strong>
        </Button>
      )}
      {options.region && (
        <Button
          size="sm"
          variant="outline"
          icon={X}
          onClick={() => options.setRegion(null)}
        >
          <span className="mr-1">Region is</span>
          <strong>{options.region}</strong>
        </Button>
      )}
      {options.city && (
        <Button
          size="sm"
          variant="outline"
          icon={X}
          onClick={() => options.setCity(null)}
        >
          <span className="mr-1">City is</span>
          <strong>{options.city}</strong>
        </Button>
      )}
      {options.browser && (
        <Button
          size="sm"
          variant="outline"
          icon={X}
          onClick={() => options.setBrowser(null)}
        >
          <span className="mr-1">Browser is</span>
          <strong>{options.browser}</strong>
        </Button>
      )}
      {options.browserVersion && (
        <Button
          size="sm"
          variant="outline"
          icon={X}
          onClick={() => options.setBrowserVersion(null)}
        >
          <span className="mr-1">Browser Version is</span>
          <strong>{options.browserVersion}</strong>
        </Button>
      )}
      {options.os && (
        <Button
          size="sm"
          variant="outline"
          icon={X}
          onClick={() => options.setOS(null)}
        >
          <span className="mr-1">OS is</span>
          <strong>{options.os}</strong>
        </Button>
      )}
      {options.osVersion && (
        <Button
          size="sm"
          variant="outline"
          icon={X}
          onClick={() => options.setOSVersion(null)}
        >
          <span className="mr-1">OS Version is</span>
          <strong>{options.osVersion}</strong>
        </Button>
      )}
    </div>
  );
}
