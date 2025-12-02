'use client';
import { baseOptions } from '@/lib/layout.shared';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { MenuIcon, MoonIcon, SunIcon, XIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { FeatureCardContainer } from './feature-card';
import { GithubButton } from './github-button';
import { Logo } from './logo';
import { Button } from './ui/button';

const LINKS = [
  {
    text: 'Home',
    url: '/',
  },
  {
    text: 'Pricing',
    url: '/pricing',
  },
  {
    text: 'Supporter',
    url: '/supporter',
  },
  {
    text: 'Docs',
    url: '/docs',
  },
  {
    text: 'Articles',
    url: '/articles',
  },
];

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navbarRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    // If click outside of the menu, close it
    const handleClick = (e: MouseEvent) => {
      if (isMobileMenuOpen && !navbarRef.current?.contains(e.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [isMobileMenuOpen]);

  return (
    <nav
      className={cn(
        'fixed top-0 z-50 w-full py-4 border-b transition-colors duration-500',
        isScrolled
          ? 'bg-background border-border'
          : 'bg-background/0 border-border/0',
      )}
      ref={navbarRef}
    >
      <div className="container">
        <div className={cn('flex justify-between items-center')}>
          {/* Logo */}
          <div className="shrink-0">
            <Link href="/" className="row items-center font-medium">
              <Logo className="h-6" />
              <span className="hidden [@media(min-width:850px)]:block">
                {baseOptions().nav?.title}
              </span>
            </Link>
          </div>

          <div className="row items-center gap-8">
            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-8 text-sm">
              {LINKS?.map((link) => {
                return (
                  <Link
                    key={link.url}
                    href={link.url!}
                    className="text-foreground/80 hover:text-foreground font-medium"
                  >
                    {link.text}
                  </Link>
                );
              })}
            </div>

            {/* Right side buttons */}
            <div className="flex items-center gap-2">
              <GithubButton />
              {/* Sign in button */}
              <Button asChild>
                <Link
                  className="hidden md:flex"
                  href="https://dashboard.openpanel.dev/onboarding"
                >
                  Sign up
                </Link>
              </Button>
              <ThemeToggle />
              <Button
                className="md:hidden -my-2"
                size="icon"
                variant="ghost"
                onClick={() => {
                  setIsMobileMenuOpen((p) => !p);
                }}
              >
                <MenuIcon className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
        {/* Mobile menu */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              ref={mobileMenuRef}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden bg-background/20 md:hidden backdrop-blur-lg fixed inset-0 p-4"
              onClick={(e) => {
                const target = e.target as HTMLElement;
                if (target === mobileMenuRef.current) {
                  setIsMobileMenuOpen(false);
                }
              }}
            >
              <FeatureCardContainer className="col text-sm divide-y divide-foreground/10 gap-0 mt-12 py-4">
                {LINKS?.map((link) => {
                  return (
                    <Link
                      key={link.url}
                      href={link.url!}
                      className="text-foreground/80 hover:text-foreground text-lg font-semibold p-4 px-0"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      {link.text}
                    </Link>
                  );
                })}
              </FeatureCardContainer>
              <div className="row gap-2 absolute top-3 right-4 items-center">
                <ThemeToggle className="flex!" />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <XIcon className="size-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
};

export default Navbar;

function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme();
  return (
    <Button
      size="icon"
      variant="naked"
      onClick={() => theme.setTheme(theme.theme === 'dark' ? 'light' : 'dark')}
      className={cn(
        'relative overflow-hidden size-8 cursor-pointer hidden md:inline',
        className,
      )}
      suppressHydrationWarning
    >
      <AnimatePresence mode="wait" initial={false}>
        {theme.theme === 'dark' ||
        (!theme.theme && theme.resolvedTheme === 'dark') ? (
          <motion.div
            key="moon"
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            <MoonIcon className="size-4" suppressHydrationWarning />
          </motion.div>
        ) : (
          <motion.div
            key="sun"
            initial={{ rotate: 90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: -90, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            <SunIcon className="size-4" suppressHydrationWarning />
          </motion.div>
        )}
      </AnimatePresence>
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
