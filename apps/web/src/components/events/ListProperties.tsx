import { toDots } from '@/utils/object';

import { Table, TableBody, TableCell, TableRow } from '../ui/table';

interface ListPropertiesProps {
  data: any;
  className?: string;
}

export function ListProperties({
  data,
  className = 'mini',
}: ListPropertiesProps) {
  const dots = toDots(data);
  return (
    <Table className={className}>
      <TableBody>
        {Object.keys(dots).map((key) => {
          return (
            <TableRow key={key}>
              <TableCell className="font-medium">{key}</TableCell>
              <TableCell>
                {typeof dots[key] === 'boolean'
                  ? dots[key]
                    ? 'true'
                    : 'false'
                  : dots[key]}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
