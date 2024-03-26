import { Navbar } from '../navbar';

interface Props {
  children: React.ReactNode;
}

export default function Layout({ children }: Props) {
  return (
    <>
      <Navbar darkText />
      <div
        className="absolute left-0 right-0 top-0 z-0 h-screen w-full bg-[radial-gradient(circle_at_2px_2px,#D9DEF6_2px,transparent_0)] text-blue-950 opacity-50"
        style={{
          backgroundSize: '70px 70px',
        }}
      />
      <div className="relative">{children}</div>
    </>
  );
}
