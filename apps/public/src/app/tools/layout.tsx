import type { ReactNode } from 'react';
import ToolsSidebar from './tools-sidebar';
import { Footer } from '@/components/footer';
import Navbar from '@/components/navbar';

export default function ToolsLayout({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  return (
    <>
      <Navbar />
      <div className="mt-12 min-h-screen md:mt-32">
        <div className="container py-8 md:py-12">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
            <main className="lg:col-span-3">{children}</main>
            <ToolsSidebar />
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
