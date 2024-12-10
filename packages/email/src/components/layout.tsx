import {
  Body,
  Container,
  Font,
  Html,
  Img,
  Section,
  Tailwind,
} from '@react-email/components';
// biome-ignore lint/style/useImportType: resend needs React
import React from 'react';
import { Footer } from './footer';

type Props = {
  children: React.ReactNode;
};

export function Layout({ children }: Props) {
  return (
    <Html>
      <Tailwind>
        <head>
          <Font
            fontFamily="Geist"
            fallbackFontFamily="Helvetica"
            webFont={{
              url: 'https://cdn.jsdelivr.net/npm/@fontsource/geist-sans@5.0.1/files/geist-sans-latin-400-normal.woff2',
              format: 'woff2',
            }}
            fontWeight={400}
            fontStyle="normal"
          />

          <Font
            fontFamily="Geist"
            fallbackFontFamily="Helvetica"
            webFont={{
              url: 'https://cdn.jsdelivr.net/npm/@fontsource/geist-sans@5.0.1/files/geist-sans-latin-500-normal.woff2',
              format: 'woff2',
            }}
            fontWeight={500}
            fontStyle="normal"
          />
        </head>
        <Body className="bg-[#fff] my-auto mx-auto font-sans">
          <Container
            className="border-transparent md:border-[#E8E7E1] my-[40px] mx-auto max-w-[600px]"
            style={{ borderStyle: 'solid', borderWidth: 1 }}
          >
            <Section className="p-6">
              <Img
                src={'https://openpanel.dev/logo.png'}
                width="80"
                height="80"
                alt="OpenPanel Logo"
                style={{ borderRadius: 4 }}
              />
            </Section>
            <Section className="p-6">{children}</Section>
            <Footer />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
