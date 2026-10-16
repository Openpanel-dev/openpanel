import type { ReactNode } from 'react';
import { LoginNavbar } from './login-navbar';
import { LogoSquare } from './logo';

interface PublicPageCardProps {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  showFooter?: boolean;
}

export function PublicPageCard({
  title,
  description,
  children,
  showFooter = true,
}: PublicPageCardProps) {
  return (
    <div>
      <LoginNavbar />
      <div className="center-center col h-screen w-screen p-4">
        <div className="w-full max-w-md rounded-lg bg-background p-6 text-left">
          <div className="col mt-1 flex-1 gap-2">
            <LogoSquare className="mb-4 size-12" />
            <div className="font-semibold text-xl">{title}</div>
            {description && (
              <div className="text-lg text-muted-foreground leading-normal">
                {description}
              </div>
            )}
          </div>
          {!!children && <div className="mt-6">{children}</div>}
        </div>
        {showFooter && (
          <div className="col max-w-sm gap-1 p-6 text-muted-foreground text-sm">
            <p>
              Powered by{' '}
              <a className="font-medium" href="https://openpanel.dev">
                OpenPanel.dev
              </a>
              {' · '}
              <a href="https://dashboard.openpanel.dev/onboarding">
                Try it for free today!
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
