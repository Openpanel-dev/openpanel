import { useAppContext } from '@/hooks/use-app-context';
import { cn } from '@/utils/cn';
import { MenuIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { LogoSquare } from './logo';
import { Button, LinkButton } from './ui/button';

export function LoginNavbar({ className }: { className?: string }) {
  const { isSelfHosted } = useAppContext();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div
      className={cn(
        'absolute top-0 left-0 w-full row justify-between items-center p-8 z-10',
        className,
      )}
    >
      <a href="https://openpanel.dev" className="row items-center gap-2">
        <LogoSquare className="size-8 shrink-0" />
        <span className="font-medium text-sm text-muted-foreground">
          {isSelfHosted ? 'Self-hosted analytics' : 'OpenPanel.dev'}
        </span>
      </a>
      <nav className="max-md:hidden">
        <ul className="row gap-4 items-center [&>li>a]:text-sm [&>li>a]:text-muted-foreground [&>li>a]:hover:underline">
          <li>
            <a href="https://openpanel.dev">OpenPanel Cloud</a>
          </li>
          <li>
            <a href="https://openpanel.dev/compare/mixpanel-alternative">
              Mixpanel alternative
            </a>
          </li>
          <li>
            <a href="https://openpanel.dev/compare/mixpanel-alternative">
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
      <div className="md:hidden relative">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
        >
          {mobileMenuOpen ? <XIcon size={20} /> : <MenuIcon size={20} />}
        </Button>
        {mobileMenuOpen && (
          <>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            />
            <nav className="absolute right-0 top-full mt-2 z-50 bg-card border border-border rounded-md shadow-lg min-w-48 py-2">
              <ul className="flex flex-col *:text-sm *:text-muted-foreground">
                <li>
                  <a
                    href="https://openpanel.dev"
                    className="block px-4 py-2 hover:bg-accent hover:text-accent-foreground"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    OpenPanel Cloud
                  </a>
                </li>
                <li>
                  <a
                    href="https://openpanel.dev/compare/mixpanel-alternative"
                    className="block px-4 py-2 hover:bg-accent hover:text-accent-foreground"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Posthog alternative
                  </a>
                </li>
                <li>
                  <a
                    href="https://openpanel.dev/compare/mixpanel-alternative"
                    className="block px-4 py-2 hover:bg-accent hover:text-accent-foreground"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Mixpanel alternative
                  </a>
                </li>
                <li>
                  <a
                    href="https://openpanel.dev/articles/open-source-web-analytics"
                    className="block px-4 py-2 hover:bg-accent hover:text-accent-foreground"
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
