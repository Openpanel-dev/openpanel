import Link from "next/link";

export function Navbar() {
  return (
    <div className="flex gap-4 text-sm uppercase">
      <Link href="/">Dashboards</Link>
      <Link href="/reports">Reports</Link>
    </div>
  );
}
