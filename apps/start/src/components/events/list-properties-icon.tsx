import { SerieIcon } from '../report-chart/common/serie-icon';
import { Tooltiper } from '../ui/tooltip';

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
    <div className="flex gap-1.5">
      {country && (
        <Tooltiper content={[country, city].filter(Boolean).join(', ')}>
          <SerieIcon name={country} />
        </Tooltiper>
      )}
      {os && (
        <Tooltiper content={`${os} (${os_version})`}>
          <SerieIcon name={os} />
        </Tooltiper>
      )}
      {browser && (
        <Tooltiper content={`${browser} (${browser_version})`}>
          <SerieIcon name={browser} />
        </Tooltiper>
      )}
      {referrer_name && (
        <Tooltiper content={`${referrer_name} (${referrer_type})`}>
          <SerieIcon name={referrer_name} />
        </Tooltiper>
      )}
    </div>
  );
}
