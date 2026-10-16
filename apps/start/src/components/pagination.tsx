import { useIsFetching } from '@tanstack/react-query';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from './ui/button';
import { cn } from '@/utils/cn';

export function usePagination(take: number) {
  const [page, setPage] = useState(0);
  return {
    take,
    skip: page * take,
    setPage,
    page,
    paginate: <T,>(data: T[]): T[] =>
      data.slice(page * take, (page + 1) * take),
  };
}

export type Props = {
  canNextPage: boolean;
  canPreviousPage: boolean;
  pageIndex: number | string;
  nextPage: () => void;
  previousPage: () => void;
  className?: string;
  loading?: boolean;
  firstPage?: () => void;
  lastPage?: () => void;
};

export function Pagination({
  canNextPage,
  canPreviousPage,
  pageIndex,
  firstPage,
  lastPage,
  nextPage,
  previousPage,
  className,
}: Props) {
  const isFetching = useIsFetching() > 0;
  const isLoading = isFetching;
  return (
    <div
      className={cn(
        'flex select-none items-center justify-end gap-1',
        className
      )}
    >
      {typeof firstPage === 'function' && (
        <Button
          className="max-sm:hidden"
          disabled={!canPreviousPage}
          icon={ChevronsLeftIcon}
          onClick={() => firstPage?.()}
          size="icon"
          variant="outline"
        />
      )}
      <Button
        disabled={!canPreviousPage}
        icon={ChevronLeftIcon}
        onClick={() => previousPage()}
        size="icon"
        variant="outline"
      />

      <Button
        className={cn(typeof pageIndex === 'string' && 'w-auto min-w-8 px-2')}
        disabled
        loading={isLoading}
        loadingAbsolute
        loadingType="ring"
        size="icon"
        variant="outline"
      >
        {typeof pageIndex === 'number' ? pageIndex + 1 : pageIndex}
      </Button>

      <Button
        disabled={!canNextPage}
        icon={ChevronRightIcon}
        onClick={() => nextPage()}
        size="icon"
        variant="outline"
      />

      {typeof lastPage === 'function' && (
        <Button
          className="max-sm:hidden"
          disabled={!canNextPage}
          icon={ChevronsRightIcon}
          onClick={() => lastPage?.()}
          size="icon"
          variant="outline"
        />
      )}
    </div>
  );
}
