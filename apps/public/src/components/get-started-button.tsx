import { cn } from '@/lib/utils';
import { ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';
import { Button } from './ui/button';

export function GetStartedButton({
  text,
  href = 'https://dashboard.openpanel.dev/onboarding',
  className,
}: {
  text?: React.ReactNode;
  className?: string;
  href?: string;
}) {
  return (
    <Button size="lg" asChild className={cn('group', className)}>
      <Link href={href}>
        {text ?? 'Get started now'}
        <ChevronRightIcon className="size-4 group-hover:translate-x-1 transition-transform group-hover:scale-125" />
      </Link>
    </Button>
  );
}
