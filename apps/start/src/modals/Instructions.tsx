import Syntax from '@/components/syntax';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, LinkButton } from '@/components/ui/button';
import {
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ExternalLinkIcon, XIcon } from 'lucide-react';

import type { IServiceClient } from '@openpanel/db';
import type { frameworks } from '@openpanel/sdk-info';

import { popModal } from '.';

type Props = {
  client: IServiceClient | null;
  framework: (typeof frameworks)[number];
};

const Header = ({ framework }: Pick<Props, 'framework'>) => (
  <SheetHeader>
    <SheetTitle>Instructions for {framework.name}</SheetTitle>
  </SheetHeader>
);

const Footer = ({ framework }: Pick<Props, 'framework'>) => (
  <SheetFooter className="absolute bottom-0 left-0 right-0 p-4">
    <Button
      variant={'secondary'}
      className="flex-1"
      onClick={() => popModal()}
      icon={XIcon}
    >
      Close
    </Button>
    <LinkButton
      target="_blank"
      href={framework.href}
      className="flex-1"
      icon={ExternalLinkIcon}
    >
      More details
    </LinkButton>
  </SheetFooter>
);

const Instructions = ({ framework }: Props) => {
  return (
    <iframe
      className="w-full h-full"
      src={framework.href}
      title={framework.name}
    />
  );
};

export default function InstructionsWithModalContent(props: Props) {
  return (
    <SheetContent className="p-0">
      <Instructions {...props} />
      <Footer {...props} />
    </SheetContent>
  );
}
