import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface ListOrganizationsProps {
  organizations: any[];
}

export function ListOrganizations({ organizations }: ListOrganizationsProps) {
  return (
    <>
      <div className="flex flex-col gap-4 -mx-6">
        {organizations.map((item) => (
          <Link
            key={item.id}
            href={`/${item.id}`}
            className="block px-6 py-3 flex items-center justify-between border-b border-border last:border-b-0 hover:bg-slate-100"
          >
            <span className="font-medium">{item.name}</span>
            <ChevronRight size={20} />
          </Link>
        ))}
      </div>
    </>
  );
}
