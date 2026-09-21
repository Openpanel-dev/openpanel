import type { IServiceClient } from '@openpanel/core';
import type { frameworks } from '@openpanel/sdk-info';
import { ExternalLinkIcon, XIcon } from 'lucide-react';
import { popModal } from '.';
import { Button, LinkButton } from '@/components/ui/button';
import {
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

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
  <SheetFooter className="absolute right-0 bottom-0 left-0 p-4">
    <Button
      className="flex-1"
      icon={XIcon}
      onClick={() => popModal()}
      variant={'secondary'}
    >
      Close
    </Button>
    <LinkButton
      className="flex-1"
      href={framework.href}
      icon={ExternalLinkIcon}
      target="_blank"
    >
      More details
    </LinkButton>
  </SheetFooter>
);

const Instructions = ({ framework }: Props) => {
  return (
    <iframe
      className="h-full w-full"
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
