'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef } from 'react';
import type { editor } from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import type { CodeResult } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
loader.config({ paths: { vs: '/monaco/vs' } });
const Monaco = dynamic(() => import('@monaco-editor/react'), { ssr: false });
export default function CodePreview({
  fontSize,
  result,
  selectedId,
  onSelect,
}: {
  fontSize: number;
  result: CodeResult | null;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const { t } = useI18n();
  const ed = useRef<editor.IStandaloneCodeEditor | null>(null);
  const decorations = useRef<editor.IEditorDecorationsCollection | null>(null);
  const refs = useRef({ result, onSelect, selectedId });
  refs.current = { result, onSelect, selectedId };
  const highlight = useCallback(() => {
    const { result, selectedId } = refs.current;
    const range = selectedId && result?.ranges[selectedId];
    if (!ed.current) return;
    if (range) {
      decorations.current?.set([
        {
          range: {
            startLineNumber: range.startLine,
            startColumn: 1,
            endLineNumber: range.endLine,
            endColumn: 1,
          },
          options: { isWholeLine: true, className: 'code-node-highlight' },
        },
      ]);
      ed.current.revealLineInCenterIfOutsideViewport(range.startLine);
    } else decorations.current?.clear();
  }, []);
  useEffect(highlight, [highlight, selectedId, result]);
  return (
    <div className="monaco-wrap">
      <Monaco
        height="100%"
        language="csharp"
        theme="vs-dark"
        value={result?.code ?? t('// Resolve the errors in Problems to generate C#.')}
        loading={<div className="code-loading">{t('Loading C# editor…')}</div>}
        options={{
          readOnly: true,
          ariaLabel: t('C# code preview'),
          fontSize,
          fontFamily: '"SFMono-Regular", Consolas, monospace',
          lineHeight: Math.round((fontSize * 5) / 3),
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          padding: { top: 10 },
          renderLineHighlight: 'none',
          folding: true,
          overviewRulerLanes: 0,
          wordWrap: 'off',
          automaticLayout: true,
          contextmenu: false,
        }}
        onMount={(editor, monaco) => {
          ed.current = editor;
          decorations.current = editor.createDecorationsCollection();
          monaco.editor.defineTheme('branch-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
              { token: 'comment', foreground: '646F69' },
              { token: 'keyword', foreground: 'A0BBA1' },
              { token: 'string', foreground: 'CCB68A' },
              { token: 'type', foreground: '83B8BB' },
            ],
            colors: {
              'editor.background': '#151719',
              'editorLineNumber.foreground': '#444A50',
              'editor.foreground': '#B7BEC5',
              'editor.selectionBackground': '#34463B',
              'editor.lineHighlightBackground': '#1D2223',
            },
          });
          monaco.editor.setTheme('branch-dark');
          highlight();
          editor.onMouseDown((e) => {
            if (e.target.position) {
              const line = e.target.position.lineNumber;
              const entries = Object.entries(refs.current.result?.ranges ?? {})
                .filter(([, r]) => line >= r.startLine && line <= r.endLine)
                .sort((a, b) => a[1].endLine - a[1].startLine - (b[1].endLine - b[1].startLine));
              if (entries[0]) refs.current.onSelect(entries[0][0]);
            }
          });
        }}
      />
    </div>
  );
}
