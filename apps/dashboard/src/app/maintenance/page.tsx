import { CalendarCogIcon } from 'lucide-react';

export default function Maintenance() {
  return (
    <div className="h-screen w-full center-center overflow-hidden">
      <div className="relative z-10 col gap-2 center-center p-4">
        <CalendarCogIcon className="size-32 mb-4 animate-wiggle text-def-300" />
        <div className="text-[90px] sm:text-[150px] font-mono font-bold -mb-16 leading-[1] select-none pointer-events-none whitespace-nowrap bg-gradient-to-b from-def-300 to-def-100 bg-clip-text text-transparent">
          Oh no!
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold">Maintenance</h1>
        <p className="text-xl text-muted-foreground leading-normal">
          We&apos;re doing a planned maintenance. Please check back later.
        </p>
      </div>
    </div>
  );
}
