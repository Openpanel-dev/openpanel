'use client';

import { basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  Compartment,
  EditorState,
  type Extension,
} from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { useEffect, useRef, useState } from 'react';
import { useTheme } from './theme-provider';

interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  language?: 'json' | 'javascript';
  onValidate?: (isValid: boolean, error?: string) => void;
}

export function JsonEditor({
  value,
  onChange,
  placeholder = '{}',
  className = '',
  minHeight = '200px',
  language = 'json',
  onValidate,
}: JsonEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartmentRef = useRef<Compartment | null>(null);
  const languageCompartmentRef = useRef<Compartment | null>(null);
  const { appTheme } = useTheme();
  const [isValid, setIsValid] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const isUpdatingRef = useRef(false);

  const validateContent = (content: string) => {
    if (!content.trim()) {
      setIsValid(true);
      setError(undefined);
      onValidate?.(true);
      return;
    }

    if (language === 'json') {
      try {
        JSON.parse(content);
        setIsValid(true);
        setError(undefined);
        onValidate?.(true);
      } catch (e) {
        setIsValid(false);
        const errorMsg =
          e instanceof Error ? e.message : 'Invalid JSON syntax';
        setError(errorMsg);
        onValidate?.(false, errorMsg);
      }
    } else if (language === 'javascript') {
      // No frontend validation for JavaScript - validation happens in tRPC
      setIsValid(true);
      setError(undefined);
      onValidate?.(true);
    }
  };

  // Create editor once on mount
  useEffect(() => {
    if (!editorRef.current || viewRef.current) return;

    const themeCompartment = new Compartment();
    themeCompartmentRef.current = themeCompartment;

    const languageCompartment = new Compartment();
    languageCompartmentRef.current = languageCompartment;

    const extensions: Extension[] = [
      basicSetup,
      languageCompartment.of(language === 'javascript' ? [javascript()] : [json()]),
      EditorState.tabSize.of(2),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          isUpdatingRef.current = true;
          const newValue = update.state.doc.toString();
          onChange(newValue);
          validateContent(newValue);

          // Reset flag after a short delay
          setTimeout(() => {
            isUpdatingRef.current = false;
          }, 0);
        }
      }),
      EditorView.theme({
        '&': {
          fontSize: '14px',
          minHeight,
          maxHeight: '400px',
        },
        '&.cm-editor': {
          borderRadius: '6px',
          border: `1px solid ${
            isValid ? 'hsl(var(--border))' : 'hsl(var(--destructive))'
          }`,
          overflow: 'hidden',
        },
        '.cm-scroller': {
          minHeight,
          maxHeight: '400px',
          overflow: 'auto',
        },
        '.cm-content': {
          padding: '12px 12px 12px 0',
          fontFamily:
            'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
          minHeight,
        },
        '.cm-focused': {
          outline: 'none',
        },
        '.cm-gutters': {
          backgroundColor: 'hsl(var(--muted))',
          borderRight: '1px solid hsl(var(--border))',
          paddingLeft: '8px',
        },
        '.cm-lineNumbers .cm-gutterElement': {
          color: 'hsl(var(--muted-foreground))',
          paddingRight: '12px',
          paddingLeft: '4px',
        },
      }),
      themeCompartment.of(appTheme === 'dark' ? [oneDark] : []),
    ];

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    // Initial validation
    validateContent(value);

    return () => {
      view.destroy();
      viewRef.current = null;
      themeCompartmentRef.current = null;
    };
  }, []); // Only create once

  // Update theme using compartment
  useEffect(() => {
    if (!viewRef.current || !themeCompartmentRef.current) return;

    viewRef.current.dispatch({
      effects: themeCompartmentRef.current.reconfigure(
        appTheme === 'dark' ? [oneDark] : [],
      ),
    });
  }, [appTheme]);

  // Update language using compartment
  useEffect(() => {
    if (!viewRef.current || !languageCompartmentRef.current) return;

    viewRef.current.dispatch({
      effects: languageCompartmentRef.current.reconfigure(
        language === 'javascript' ? [javascript()] : [json()],
      ),
    });
    validateContent(value);
  }, [language, value]);

  // Update editor content when value changes externally
  useEffect(() => {
    if (!viewRef.current || isUpdatingRef.current) return;

    const currentContent = viewRef.current.state.doc.toString();
    if (currentContent !== value) {
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: value,
        },
      });

      // Validate after external update
      validateContent(value);
    }
  }, [value]);

  return (
    <div className={className}>
      <div
        ref={editorRef}
        className={`rounded-md ${!isValid ? 'ring-1 ring-destructive' : ''}`}
      />
      {!isValid && (
        <p className="mt-1 text-sm text-destructive">
          {error || `Invalid ${language === 'javascript' ? 'JavaScript' : 'JSON'}. Please check your syntax.`}
        </p>
      )}
    </div>
  );
}
