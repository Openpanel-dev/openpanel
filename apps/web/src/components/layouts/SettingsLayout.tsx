import { Container } from "../Container";
import { MainLayout } from "./MainLayout";
import { usePathname } from "next/navigation";
import { Sidebar, WithSidebar } from "../WithSidebar";
import Link from "next/link";
import { cn } from "@/utils/cn";
import { PageTitle } from "../PageTitle";
import { useOrganizationParams } from "@/hooks/useOrganizationParams";

type SettingsLayoutProps = {
  children: React.ReactNode;
  className?: string;
};

export function SettingsLayout({ children, className }: SettingsLayoutProps) {
  const params = useOrganizationParams();
  const pathname = usePathname();
  const links = [
    { href: `/${params.organization}/settings/organization`, label: "Organization" },
    { href: `/${params.organization}/settings/projects`, label: "Projects" },
    { href: `/${params.organization}/settings/clients`, label: "Clients" },
    { href: `/${params.organization}/settings/profile`, label: "Profile" },
  ];
  return (
    <MainLayout>
      <Container>
        <PageTitle>Settings</PageTitle>
        <WithSidebar>
          <Sidebar>
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "p-4 py-3 leading-none rounded-lg transition-colors",
                  pathname.startsWith(href)
                    ? "bg-slate-100"
                    : "hover:bg-slate-100",
                )}
              >
                {label}
              </Link>
            ))}
          </Sidebar>
          <div className={cn('flex flex-col', className)}>
            {children}
          </div>
        </WithSidebar>
      </Container>
    </MainLayout>
  );
}
