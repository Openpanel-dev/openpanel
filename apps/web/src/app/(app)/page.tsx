import { ModalWrapper } from '@/modals';
import { ModalContent, ModalHeader } from '@/modals/Modal/Container';
import { redirect } from 'next/navigation';

import { db } from '@mixan/db';

import { ListOrganizations } from './list-organizations';

export default async function Page() {
  const organizations = await db.organization.findMany();

  if (organizations.length === 1 && organizations[0]?.id) {
    redirect(`/${organizations[0].id}`);
  }

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-[rgba(0,0,0,0.2)] z-50">
      <ModalWrapper>
        <ModalContent>
          <ModalHeader title="Select organization" onClose={false} />
          <ListOrganizations organizations={organizations} />
        </ModalContent>
      </ModalWrapper>
    </div>
  );
}
