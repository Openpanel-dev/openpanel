import { Footer } from '@/components/footer';
import Navbar from '@/components/navbar';
import type { ReactNode } from 'react';
import ToolsSidebar from './tools-sidebar';

export default function ToolsLayout({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  return (
    <>
      <Navbar />
      <div className="min-h-screen mt-12 md:mt-32">
        <div className="container py-8 md:py-12">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <main className="lg:col-span-3">{children}</main>
            <ToolsSidebar />
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
