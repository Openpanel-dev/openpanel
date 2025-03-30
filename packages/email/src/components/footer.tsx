import {
  Column,
  Hr,
  Img,
  Link,
  Row,
  Section,
  Text,
} from '@react-email/components';
import React from 'react';

const baseUrl = 'https://openpanel.dev';

export function Footer() {
  return (
    <>
      <Hr />
      <Section className="w-full p-6">
        <Text className="text-[21px] font-regular" style={{ margin: 0 }}>
          An open-source alternative to Mixpanel
        </Text>

        <br />

        <Row className="mt-4">
          <Column className="w-8">
            <Link href="https://git.new/openpanel">
              <Img
                src={`${baseUrl}/icons/github.png`}
                width="22"
                height="22"
                alt="OpenPanel on Github"
              />
            </Link>
          </Column>
          <Column className="w-8">
            <Link href="https://x.com/openpaneldev">
              <Img
                src={`${baseUrl}/icons/x.png`}
                width="22"
                height="22"
                alt="OpenPanel on X"
              />
            </Link>
          </Column>
          <Column className="w-8">
            <Link href="https://go.openpanel.dev/discord">
              <Img
                src={`${baseUrl}/icons/discord.png`}
                width="22"
                height="22"
                alt="OpenPanel on Discord"
              />
            </Link>
          </Column>
          <Column className="w-auto">
            <Link href="mailto:hello@openpanel.dev">
              <Img
                src={`${baseUrl}/icons/email.png`}
                width="22"
                height="22"
                alt="Contact OpenPanel with email"
              />
            </Link>
          </Column>
        </Row>

        <Row>
          <Text className="text-[#B8B8B8] text-xs">
            OpenPanel AB - Sankt Eriksgatan 100, 113 31, Stockholm, Sweden.
          </Text>
        </Row>

        {/* <Row>
          <Link
            className="text-[#707070] text-[14px]"
            href="https://dashboard.openpanel.dev/settings/notifications"
            title="Unsubscribe"
          >
            Notification preferences
          </Link>
        </Row> */}
      </Section>
    </>
  );
}
