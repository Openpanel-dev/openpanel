'use client';

import { clipboard } from '@/utils/clipboard';
import { cn } from '@/utils/cn';
import { CopyIcon } from 'lucide-react';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import bash from 'react-syntax-highlighter/dist/cjs/languages/hljs/bash';
import json from 'react-syntax-highlighter/dist/cjs/languages/hljs/json';
import ts from 'react-syntax-highlighter/dist/cjs/languages/hljs/typescript';
import docco from 'react-syntax-highlighter/dist/cjs/styles/hljs/vs2015';

SyntaxHighlighter.registerLanguage('typescript', ts);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('bash', bash);

interface SyntaxProps {
  code: string;
  className?: string;
  language?: 'typescript' | 'bash' | 'json';
  wrapLines?: boolean;
}

export default function Syntax({
  code,
  className,
  language = 'typescript',
  wrapLines = false,
}: SyntaxProps) {
  return (
    <div className={cn('group relative rounded-lg', className)}>
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
        wrapLongLines={wrapLines}
        style={docco}
        language={language}
        customStyle={{
          borderRadius: 'var(--radius)',
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
