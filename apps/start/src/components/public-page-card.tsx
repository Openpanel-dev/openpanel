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
      <div className="center-center h-screen w-screen p-4 col">
        <div className="bg-background p-6 rounded-lg max-w-md w-full text-left">
          <div className="col mt-1 flex-1 gap-2">
            <LogoSquare className="size-12 mb-4" />
            <div className="text-xl font-semibold">{title}</div>
            {description && (
              <div className="text-lg text-muted-foreground leading-normal">
                {description}
              </div>
            )}
          </div>
          {!!children && <div className="mt-6">{children}</div>}
        </div>
        {showFooter && (
          <div className="p-6 text-sm max-w-sm col gap-1 text-muted-foreground">
            <p>
              Powered by{' '}
              <a href="https://openpanel.dev" className="font-medium">
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
