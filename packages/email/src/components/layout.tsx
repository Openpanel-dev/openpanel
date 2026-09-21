import {
  Body,
  Container,
  Font,
  Html,
  Img,
  Section,
  Tailwind,
} from '@react-email/components';
// biome-ignore lint/style/useImportType: <explanation>
import React from 'react';
import { Footer } from './footer';

type Props = {
  children: React.ReactNode;
  unsubscribeUrl?: string;
};

export function Layout({ children, unsubscribeUrl }: Props) {
  return (
    <Html>
      <Tailwind>
        <head>
          <Font
            fallbackFontFamily="Helvetica"
            fontFamily="Geist"
            fontStyle="normal"
            fontWeight={400}
            webFont={{
              url: 'https://cdn.jsdelivr.net/npm/@fontsource/geist-sans@5.0.1/files/geist-sans-latin-400-normal.woff2',
              format: 'woff2',
            }}
          />

          <Font
            fallbackFontFamily="Helvetica"
            fontFamily="Geist"
            fontStyle="normal"
            fontWeight={500}
            webFont={{
              url: 'https://cdn.jsdelivr.net/npm/@fontsource/geist-sans@5.0.1/files/geist-sans-latin-500-normal.woff2',
              format: 'woff2',
            }}
          />
        </head>
        <Body className="mx-auto my-auto bg-[#fff] font-sans">
          <Container
            className="mx-auto my-[40px] max-w-[600px] border-transparent md:border-[#E8E7E1]"
            style={{ borderStyle: 'solid', borderWidth: 1 }}
          >
            <Section className="p-6">
              <Img
                alt="OpenPanel Logo"
                height="80"
                src={'https://openpanel.dev/logo.png'}
                style={{ borderRadius: 4 }}
                width="80"
              />
            </Section>
            <Section className="p-6">{children}</Section>
            <Footer unsubscribeUrl={unsubscribeUrl} />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
