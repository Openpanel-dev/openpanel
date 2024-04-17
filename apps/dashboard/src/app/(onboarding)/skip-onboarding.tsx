'use client';

import { ChevronLastIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SkipOnboarding = () => {
  const pathname = usePathname();
  if (!pathname.startsWith('/onboarding')) return null;
  return (
    <Link
      prefetch={false}
      href="/"
      className="flex items-center gap-2 text-sm text-muted-foreground"
    >
      Skip onboarding
      <ChevronLastIcon size={16} />
    </Link>
  );
};

export default SkipOnboarding;
