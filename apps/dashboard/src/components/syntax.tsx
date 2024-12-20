'use client';

import { clipboard } from '@/utils/clipboard';
import { CopyIcon } from 'lucide-react';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import ts from 'react-syntax-highlighter/dist/cjs/languages/hljs/typescript';
import docco from 'react-syntax-highlighter/dist/cjs/styles/hljs/vs2015';

SyntaxHighlighter.registerLanguage('typescript', ts);

interface SyntaxProps {
  code: string;
}

export default function Syntax({ code }: SyntaxProps) {
  return (
    <div className="group relative">
      <button
        type="button"
        className="absolute right-1 top-1 rounded bg-card p-2 opacity-0 transition-opacity group-hover:opacity-100 row items-center gap-2"
        onClick={() => {
          clipboard(code);
        }}
      >
        <span>Copy</span>
        <CopyIcon size={12} />
      </button>
      <SyntaxHighlighter
        // wrapLongLines
        style={docco}
        customStyle={{
          borderRadius: '0.5rem',
          padding: '1rem',
          paddingTop: '0.5rem',
          paddingBottom: '0.5rem',
          fontSize: 14,
          lineHeight: 1.3,
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
