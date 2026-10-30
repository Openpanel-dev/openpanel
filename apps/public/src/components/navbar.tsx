'use client';
import { ArrowRightIcon, ChevronDownIcon, MenuIcon, XIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { GithubButton } from './github-button';
import { Logo } from './logo';
import { SignUpButton } from './sign-up-button';
import { Button } from './ui/button';
import { siteName } from '@/lib/layout.shared';
import { MORE_FEATURES, NAV_LINKS, PRIMARY_FEATURES } from '@/lib/nav';
import { cn } from '@/lib/utils';

const CLOSE_DELAY_MS = 120;

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isFeaturesOpen, setIsFeaturesOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navbarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 8);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!navbarRef.current?.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
        setIsFeaturesOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileMenuOpen(false);
        setIsFeaturesOpen(false);
      }
    };
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, []);

  const openFeatures = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
    }
    setIsFeaturesOpen(true);
  };
  const closeFeaturesSoon = () => {
    closeTimer.current = setTimeout(
      () => setIsFeaturesOpen(false),
      CLOSE_DELAY_MS
    );
  };

  return (
    <nav
      className={cn(
        'fixed top-0 z-50 w-full border-b transition-colors duration-300',
        isMobileMenuOpen && 'border-border bg-background',
        !isMobileMenuOpen &&
          (isScrolled || isFeaturesOpen
            ? 'border-border bg-background/90 backdrop-blur-md'
            : 'border-transparent bg-transparent')
      )}
      ref={navbarRef}
    >
      <div className="container flex h-16 items-center justify-between">
        <Link className="row items-center gap-2 font-medium" href="/">
          <Logo className="h-5 w-auto" />
          <span className="max-[850px]:hidden">{siteName}</span>
        </Link>

        <div className="hidden items-center gap-1 text-sm md:flex">
          <div className="relative">
            <button
              aria-expanded={isFeaturesOpen}
              aria-haspopup="menu"
              className={cn(
                'row items-center gap-1 rounded-md px-3 py-2 font-medium text-foreground/80 transition-colors hover:text-foreground',
                isFeaturesOpen && 'text-foreground'
              )}
              onClick={() => setIsFeaturesOpen((open) => !open)}
              onFocus={openFeatures}
              onMouseEnter={openFeatures}
              onMouseLeave={closeFeaturesSoon}
              type="button"
            >
              Features
              <ChevronDownIcon
                className={cn(
                  'size-3.5 transition-transform',
                  isFeaturesOpen && 'rotate-180'
                )}
              />
            </button>
            <FeaturesMenu
              onMouseEnter={openFeatures}
              onMouseLeave={closeFeaturesSoon}
              onNavigate={() => setIsFeaturesOpen(false)}
              open={isFeaturesOpen}
            />
          </div>
          {NAV_LINKS.map((link) => (
            <Link
              className="rounded-md px-3 py-2 font-medium text-foreground/80 transition-colors hover:text-foreground"
              href={link.url}
              key={link.url}
            >
              {link.text}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <GithubButton />
          <SignUpButton />
          <Button
            aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
            className="md:hidden"
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            size="icon"
            variant="ghost"
          >
            {isMobileMenuOpen ? (
              <XIcon className="size-5" />
            ) : (
              <MenuIcon className="size-5" />
            )}
          </Button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <MobileMenu onNavigate={() => setIsMobileMenuOpen(false)} />
      )}
    </nav>
  );
};

export default Navbar;

function FeaturesMenu({
  open,
  onNavigate,
  onMouseEnter,
  onMouseLeave,
}: {
  open: boolean;
  onNavigate: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  return (
    <div
      className={cn(
        'absolute top-full left-1/2 w-[720px] -translate-x-1/2 pt-3 transition-all duration-150',
        open
          ? 'visible translate-y-0 opacity-100'
          : 'invisible -translate-y-1 opacity-0'
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="menu"
    >
      <div className="grid grid-cols-[1.1fr_1fr] overflow-hidden rounded-2xl border bg-background shadow-black/5 shadow-xl">
        <div className="col gap-1 p-3">
          {PRIMARY_FEATURES.map((feature) => (
            <Link
              className="group row items-start gap-3 rounded-xl p-3 transition-colors hover:bg-muted"
              href={feature.href}
              key={feature.href}
              onClick={onNavigate}
              role="menuitem"
            >
              <span className="center-center mt-0.5 size-9 shrink-0 rounded-lg bg-muted text-foreground transition-colors group-hover:bg-background">
                <feature.icon className="size-4" />
              </span>
              <span className="col gap-0.5">
                <span className="font-medium text-foreground">
                  {feature.title}
                </span>
                <span className="text-muted-foreground text-xs leading-relaxed">
                  {feature.description}
                </span>
              </span>
            </Link>
          ))}
        </div>
        <div className="col border-l bg-muted/40 p-3">
          <div className="grid flex-1 grid-cols-2 content-start gap-x-2">
            {MORE_FEATURES.map((feature) => (
              <Link
                className="row items-center gap-2 rounded-lg px-2.5 py-2 text-foreground/80 transition-colors hover:bg-background hover:text-foreground"
                href={feature.href}
                key={feature.href}
                onClick={onNavigate}
                role="menuitem"
              >
                <feature.icon className="size-3.5 text-muted-foreground" />
                <span className="text-sm">{feature.title}</span>
              </Link>
            ))}
          </div>
          <Link
            className="row mt-3 items-center gap-1 px-2.5 font-medium text-sm transition-colors hover:text-foreground"
            href="/features"
            onClick={onNavigate}
            role="menuitem"
          >
            All features <ArrowRightIcon className="size-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function MobileMenu({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="container max-h-[calc(100vh-4rem)] overflow-y-auto border-t pb-6 md:hidden">
      <p className="mt-5 mb-2 px-1 font-medium text-muted-foreground text-xs uppercase tracking-wider">
        Features
      </p>
      <div className="col">
        {PRIMARY_FEATURES.map((feature) => (
          <Link
            className="row items-center gap-3 rounded-lg px-1 py-2.5"
            href={feature.href}
            key={feature.href}
            onClick={onNavigate}
          >
            <feature.icon className="size-4 text-muted-foreground" />
            <span className="font-medium">{feature.title}</span>
          </Link>
        ))}
        <Link
          className="row items-center gap-1 px-1 py-2.5 text-muted-foreground text-sm"
          href="/features"
          onClick={onNavigate}
        >
          All features <ArrowRightIcon className="size-3.5" />
        </Link>
      </div>
      <div className="col mt-4 border-t pt-4">
        {NAV_LINKS.map((link) => (
          <Link
            className="px-1 py-2.5 font-medium"
            href={link.url}
            key={link.url}
            onClick={onNavigate}
          >
            {link.text}
          </Link>
        ))}
      </div>
    </div>
  );
}
