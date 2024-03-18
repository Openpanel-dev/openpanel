import { SerieIcon } from '../report/chart/SerieIcon';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

interface Props {
  country?: string;
  city?: string;
  os?: string;
  os_version?: string;
  browser?: string;
  browser_version?: string;
  referrer_name?: string;
  referrer_type?: string;
}

export function ListPropertiesIcon({
  country,
  city,
  os,
  os_version,
  browser,
  browser_version,
  referrer_name,
  referrer_type,
}: Props) {
  return (
    <div className="flex gap-1">
      {country && (
        <Tooltip>
          <TooltipTrigger>
            <SerieIcon name={country} />
          </TooltipTrigger>
          <TooltipContent>
            {country}, {city}
          </TooltipContent>
        </Tooltip>
      )}
      {os && (
        <Tooltip>
          <TooltipTrigger>
            <SerieIcon name={os} />
          </TooltipTrigger>
          <TooltipContent>
            {os} ({os_version})
          </TooltipContent>
        </Tooltip>
      )}
      {browser && (
        <Tooltip>
          <TooltipTrigger>
            <SerieIcon name={browser} />
          </TooltipTrigger>
          <TooltipContent>
            {browser} ({browser_version})
          </TooltipContent>
        </Tooltip>
      )}
      {referrer_name && (
        <Tooltip>
          <TooltipTrigger>
            <SerieIcon name={referrer_name} />
          </TooltipTrigger>
          <TooltipContent>
            {referrer_name} ({referrer_type})
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
