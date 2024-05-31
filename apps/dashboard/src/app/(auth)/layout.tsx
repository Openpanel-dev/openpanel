import LiveEventsServer from './live-events';

type Props = {
  children: React.ReactNode;
};

const Page = ({ children }: Props) => {
  return (
    <>
      <div className="bg-def-200">
        <div className="grid h-full md:grid-cols-[min(400px,40vw)_1fr]">
          <div className="to-def-200 min-h-screen border-r border-r-background bg-gradient-to-r from-background max-md:hidden">
            <LiveEventsServer />
          </div>
          <div className="min-h-screen">{children}</div>
        </div>
      </div>
    </>
  );
};

export default Page;
