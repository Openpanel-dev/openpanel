'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { MenuIcon, MoonIcon, SunIcon, XIcon } from 'lucide-react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import { FeatureCardContainer } from './feature-card';
import { GithubButton } from './github-button';
import { Logo } from './logo';
import { SignUpButton } from './sign-up-button';
import { Button } from './ui/button';
import { baseOptions } from '@/lib/layout.shared';
import { cn } from '@/lib/utils';

const LINKS = [
  {
    text: 'Home',
    url: '/',
  },
  {
    text: 'Pricing',
    url: '/pricing',
  },
  // {
  //   text: 'Supporter',
  //   url: '/supporter',
  // },
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
        'fixed top-0 z-50 w-full border-b py-4 transition-colors duration-500',
        isScrolled
          ? 'border-border bg-background'
          : 'border-border/0 bg-background/0'
      )}
      ref={navbarRef}
    >
      <div className="container">
        <div className={cn('flex items-center justify-between')}>
          {/* Logo */}
          <div className="shrink-0">
            <Link className="row items-center font-medium" href="/">
              <Logo className="h-6" />
              <span className="hidden [@media(min-width:850px)]:block">
                {baseOptions().nav?.title}
              </span>
            </Link>
          </div>

          <div className="row items-center gap-8">
            {/* Desktop Navigation */}
            <div className="hidden items-center space-x-8 text-sm md:flex">
              {LINKS?.map((link) => {
                return (
                  <Link
                    className="font-medium text-foreground/80 hover:text-foreground"
                    href={link.url!}
                    key={link.url}
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
              <SignUpButton />
              <ThemeToggle />
              <Button
                className="-my-2 md:hidden"
                onClick={() => {
                  setIsMobileMenuOpen((p) => !p);
                }}
                size="icon"
                variant="ghost"
              >
                <MenuIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        {/* Mobile menu */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              animate={{ height: 'auto', opacity: 1 }}
              className="fixed inset-0 overflow-hidden bg-background/20 p-4 backdrop-blur-lg md:hidden"
              exit={{ height: 0, opacity: 0 }}
              initial={{ height: 0, opacity: 0 }}
              onClick={(e) => {
                const target = e.target as HTMLElement;
                if (target === mobileMenuRef.current) {
                  setIsMobileMenuOpen(false);
                }
              }}
              ref={mobileMenuRef}
              transition={{ duration: 0.2 }}
            >
              <FeatureCardContainer className="col mt-12 gap-0 divide-y divide-foreground/10 py-4 text-sm">
                {LINKS?.map((link) => {
                  return (
                    <Link
                      className="p-4 px-0 font-semibold text-foreground/80 text-lg hover:text-foreground"
                      href={link.url!}
                      key={link.url}
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      {link.text}
                    </Link>
                  );
                })}
              </FeatureCardContainer>
              <div className="row absolute top-3 right-4 items-center gap-2">
                <ThemeToggle className="flex!" />
                <Button
                  onClick={() => setIsMobileMenuOpen(false)}
                  size="icon"
                  variant="outline"
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
      className={cn(
        'relative hidden size-8 cursor-pointer overflow-hidden md:inline',
        className
      )}
      onClick={() => theme.setTheme(theme.theme === 'dark' ? 'light' : 'dark')}
      size="icon"
      suppressHydrationWarning
      variant="naked"
    >
      <AnimatePresence initial={false} mode="wait">
        {theme.theme === 'dark' ||
        (!theme.theme && theme.resolvedTheme === 'dark') ? (
          <motion.div
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            initial={{ rotate: -90, opacity: 0 }}
            key="moon"
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            <MoonIcon className="size-4" suppressHydrationWarning />
          </motion.div>
        ) : (
          <motion.div
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: -90, opacity: 0 }}
            initial={{ rotate: 90, opacity: 0 }}
            key="sun"
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
