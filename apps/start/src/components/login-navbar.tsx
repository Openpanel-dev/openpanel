import { MenuIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { LogoSquare } from './logo';
import { Button } from './ui/button';
import { useAppContext } from '@/hooks/use-app-context';
import { cn } from '@/utils/cn';

export function LoginNavbar({ className }: { className?: string }) {
  const { isSelfHosted } = useAppContext();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div
      className={cn(
        'row absolute top-0 left-0 z-10 w-full items-center justify-between p-8',
        className
      )}
    >
      <a className="row items-center gap-2" href="https://openpanel.dev">
        <LogoSquare className="size-8 shrink-0" />
        <span className="font-medium text-muted-foreground text-sm">
          {isSelfHosted ? 'Self-hosted analytics' : 'OpenPanel.dev'}
        </span>
      </a>
      {isSelfHosted && (
        <nav className="max-md:hidden">
          <ul className="row items-center gap-4 [&>li>a]:text-muted-foreground [&>li>a]:text-sm [&>li>a]:hover:underline">
            <li>
              <a href="https://openpanel.dev">OpenPanel Cloud</a>
            </li>
            <li>
              <a href="https://openpanel.dev/compare/mixpanel-alternative">
                Mixpanel alternative
              </a>
            </li>
            <li>
              <a href="https://openpanel.dev/compare/posthog-alternative">
                Posthog alternative
              </a>
            </li>
            <li>
              <a href="https://openpanel.dev/articles/open-source-web-analytics">
                Open source analytics
              </a>
            </li>
          </ul>
        </nav>
      )}
      <div className="relative md:hidden">
        <Button
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          size="icon"
          variant="ghost"
        >
          {mobileMenuOpen ? <XIcon size={20} /> : <MenuIcon size={20} />}
        </Button>
        {mobileMenuOpen && (
          <>
            <button
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
              type="button"
            />
            <nav className="absolute top-full right-0 z-50 mt-2 min-w-48 rounded-md border border-border bg-card py-2 shadow-lg">
              <ul className="flex flex-col *:text-muted-foreground *:text-sm">
                <li>
                  <a
                    className="block px-4 py-2 hover:bg-accent hover:text-accent-foreground"
                    href="https://openpanel.dev"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    OpenPanel Cloud
                  </a>
                </li>
                <li>
                  <a
                    className="block px-4 py-2 hover:bg-accent hover:text-accent-foreground"
                    href="https://openpanel.dev/compare/mixpanel-alternative"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Posthog alternative
                  </a>
                </li>
                <li>
                  <a
                    className="block px-4 py-2 hover:bg-accent hover:text-accent-foreground"
                    href="https://openpanel.dev/compare/mixpanel-alternative"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Mixpanel alternative
                  </a>
                </li>
                <li>
                  <a
                    className="block px-4 py-2 hover:bg-accent hover:text-accent-foreground"
                    href="https://openpanel.dev/articles/open-source-web-analytics"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Open source analytics
                  </a>
                </li>
              </ul>
            </nav>
          </>
        )}
      </div>
    </div>
  );
}
