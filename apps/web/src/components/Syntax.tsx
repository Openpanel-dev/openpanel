import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import ts from "react-syntax-highlighter/dist/cjs/languages/hljs/typescript";
import docco from "react-syntax-highlighter/dist/cjs/styles/hljs/docco";

SyntaxHighlighter.registerLanguage("typescript", ts);

type SyntaxProps = {
  code: string;
};

export default function Syntax({ code }: SyntaxProps) {
  return <SyntaxHighlighter style={docco}>{code}</SyntaxHighlighter>;
}
