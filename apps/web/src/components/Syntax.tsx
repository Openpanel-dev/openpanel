import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import ts from 'react-syntax-highlighter/dist/cjs/languages/hljs/typescript';
import docco from 'react-syntax-highlighter/dist/cjs/styles/hljs/docco';

SyntaxHighlighter.registerLanguage('typescript', ts);

interface SyntaxProps {
  code: string;
}

export default function Syntax({ code }: SyntaxProps) {
  return (
    <SyntaxHighlighter wrapLongLines style={docco}>
      {code}
    </SyntaxHighlighter>
  );
}
