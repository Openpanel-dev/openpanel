import { useOrganizationParams } from "@/hooks/useOrganizationParams";
import Link from "next/link";
import { NavbarCreate } from "./NavbarCreate";

export function NavbarMenu() {
  const params = useOrganizationParams()
  return (
    <div className="flex gap-6 items-center">
      <Link href={`/${params.organization}`}>Home</Link>
      <NavbarCreate />
    </div>
  );
}
