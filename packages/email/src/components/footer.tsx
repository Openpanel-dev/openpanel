import {
  Column,
  Hr,
  Img,
  Link,
  Row,
  Section,
  Text,
} from '@react-email/components';

const baseUrl = 'https://openpanel.dev';

export function Footer({ unsubscribeUrl }: { unsubscribeUrl?: string }) {
  return (
    <>
      <Hr />
      <Section className="w-full p-6">
        <Text className="font-regular text-[21px]" style={{ margin: 0 }}>
          An open-source alternative to Mixpanel
        </Text>

        <br />

        <Row className="mt-4">
          <Column className="w-8">
            <Link href="https://git.new/openpanel">
              <Img
                alt="OpenPanel on Github"
                height="22"
                src={`${baseUrl}/icons/github.png`}
                width="22"
              />
            </Link>
          </Column>
          <Column className="w-8">
            <Link href="https://x.com/openpaneldev">
              <Img
                alt="OpenPanel on X"
                height="22"
                src={`${baseUrl}/icons/x.png`}
                width="22"
              />
            </Link>
          </Column>
          <Column className="w-8">
            <Link href="https://go.openpanel.dev/discord">
              <Img
                alt="OpenPanel on Discord"
                height="22"
                src={`${baseUrl}/icons/discord.png`}
                width="22"
              />
            </Link>
          </Column>
          <Column className="w-auto">
            <Link href="mailto:hello@openpanel.dev">
              <Img
                alt="Contact OpenPanel with email"
                height="22"
                src={`${baseUrl}/icons/email.png`}
                width="22"
              />
            </Link>
          </Column>
        </Row>

        <Row>
          <Text className="text-[#B8B8B8] text-xs">
            OpenPanel AB - Sankt Eriksgatan 100, 113 31, Stockholm, Sweden.
          </Text>
        </Row>

        {unsubscribeUrl && (
          <Row>
            <Link
              className="text-[#707070] text-[14px]"
              href={unsubscribeUrl}
              title="Unsubscribe"
            >
              Notification preferences
            </Link>
          </Row>
        )}
      </Section>
    </>
  );
}
