interface PageLayoutProps {
  title: React.ReactNode;
}

function PageLayout({ title }: PageLayoutProps) {
  return (
    <>
      <div className="sticky top-0 z-20 flex h-16 flex-shrink-0 items-center justify-between border-b border-border bg-card px-4 pl-14 lg:pl-4">
        <div className="text-xl font-medium">{title}</div>
      </div>
    </>
  );
}

export default PageLayout;
