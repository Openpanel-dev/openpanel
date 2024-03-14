import { Navbar } from '../navbar';

interface Props {
  children: React.ReactNode;
}

export default function Layout({ children }: Props) {
  return (
    <>
      <Navbar darkText />
      <div
        className="opacity-50 w-full h-screen text-blue-950 bg-[radial-gradient(circle_at_2px_2px,#D9DEF6_2px,transparent_0)] absolute top-0 left-0 right-0 z-0"
        style={{
          backgroundSize: '70px 70px',
        }}
      />
      <div className="relative">{children}</div>
    </>
  );
}
