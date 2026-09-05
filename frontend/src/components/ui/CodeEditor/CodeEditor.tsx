'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, indentOnInput } from '@codemirror/language';
import styles from './CodeEditor.module.css';

interface CodeEditorProps {
  value: string;
  language?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}

export function CodeEditor({ value, language = 'markdown', onChange, readOnly = false }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Avoid SSR hydration issues
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const getLanguageExtension = useCallback(() => {
    if (language.endsWith('.json') || language === 'json') return json();
    return markdown();
  }, [language]);

  useEffect(() => {
    if (!isMounted || !containerRef.current) return;

    // Destroy previous instance
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    const extensions = [
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      bracketMatching(),
      foldGutter(),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      oneDark,
      getLanguageExtension(),
      keymap.of([...defaultKeymap, indentWithTab]),
      EditorView.lineWrapping,
      EditorView.theme({
        '&': {
          height: '100%',
          fontSize: '14px',
          fontFamily: 'var(--font-mono, "IBM Plex Mono", Consolas, monospace)',
        },
        '.cm-scroller': {
          overflow: 'auto',
          fontFamily: 'inherit',
        },
        '.cm-content': {
          padding: '1rem 0',
          minHeight: '100%',
        },
        '.cm-gutters': {
          background: '#1a1a2e',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          color: 'rgba(255,255,255,0.25)',
        },
        '.cm-activeLineGutter': {
          background: 'rgba(255,255,255,0.05)',
        },
        '.cm-activeLine': {
          background: 'rgba(255,255,255,0.03)',
        },
        '.cm-cursor': {
          borderLeftColor: 'var(--accent-primary, #6366f1)',
        },
        '.cm-selectionBackground': {
          background: 'rgba(99, 102, 241, 0.25) !important',
        },
      }),
    ];

    if (readOnly) {
      extensions.push(EditorState.readOnly.of(true));
    }

    if (onChange) {
      extensions.push(
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString());
          }
        })
      );
    }

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    viewRef.current = new EditorView({
      state,
      parent: containerRef.current,
    });

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
    // We intentionally only re-create the editor when language/readOnly change,
    // not when `value` changes (that would reset cursor position).
  }, [isMounted, language, readOnly, getLanguageExtension]);

  // Sync external value changes without re-creating the editor
  useEffect(() => {
    if (!viewRef.current) return;
    const currentDoc = viewRef.current.state.doc.toString();
    if (currentDoc !== value) {
      viewRef.current.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
    }
  }, [value]);

  if (!isMounted) {
    // SSR fallback
    return (
      <div className={styles.container}>
        <pre className={styles.fallback}>{value}</pre>
      </div>
    );
  }

  return <div ref={containerRef} className={styles.container} />;
}
