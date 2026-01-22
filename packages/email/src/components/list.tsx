import { Text } from '@react-email/components';
// biome-ignore lint/style/useImportType: <explanation>
import React from 'react';

export function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul style={{ paddingLeft: 20 }}>
      {items.map((node, index) => (
        <li key={index.toString()}>
          <Text style={{ marginBottom: 2, marginTop: 2 }}>{node}</Text>
        </li>
      ))}
    </ul>
  );
}
