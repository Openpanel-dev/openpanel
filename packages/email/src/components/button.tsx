import { Button as EmailButton } from '@react-email/components';
import type * as React from 'react';

export function Button({
  href,
  children,
  style,
}: { href: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <EmailButton
      href={href}
      style={{
        backgroundColor: '#000',
        borderRadius: '6px',
        color: '#fff',
        padding: '12px 20px',
        textDecoration: 'none',
        ...style,
      }}
    >
      {children}
    </EmailButton>
  );
}
