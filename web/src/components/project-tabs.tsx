'use client';
import { useEffect, useRef } from 'react';
import { Gamepad2, Plus, Workflow, X } from 'lucide-react';
import type { Mode } from '@/lib/types';
import { IconButton } from './ui/button';

export default function ProjectTabs({
  documents,
  activeId,
  onSelect,
  onCreate,
  onClose,
}: {
  documents: { id: string; name: string; mode: Mode }[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onClose: (id: string) => void;
}) {
  const tabs = useRef(new Map<string, HTMLButtonElement>());
  const list = useRef<HTMLDivElement>(null);
  const labelsKey = documents.map((document) => `${document.id}:${document.name}`).join('|');
  useEffect(() => {
    const reveal = () =>
      tabs.current
        .get(activeId)
        ?.parentElement?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    reveal();
    const observer = new ResizeObserver(reveal);
    if (list.current) observer.observe(list.current);
    for (const tab of tabs.current.values()) observer.observe(tab);
    return () => observer.disconnect();
  }, [activeId, labelsKey]);
  return (
    <div className="project-tab-bar">
      <div ref={list} className="project-tablist" role="tablist" aria-label="Project tabs">
        {documents.map((document, index) => (
          <div
            key={document.id}
            className="project-tab-item"
            data-active={document.id === activeId}
            role="presentation"
          >
            <button
              ref={(element) => {
                if (element) tabs.current.set(document.id, element);
                else tabs.current.delete(document.id);
              }}
              id={`project-tab-${document.id}`}
              role="tab"
              aria-label={document.name || 'Untitled tree'}
              aria-controls="project-editor"
              aria-selected={document.id === activeId}
              tabIndex={document.id === activeId ? 0 : -1}
              className="project-tab"
              title={`${document.name || 'Untitled tree'} · ${document.mode === 'game' ? 'Game AI' : 'Workflow'}`}
              onClick={() => onSelect(document.id)}
              onKeyDown={(event) => {
                let next: number;
                if (event.key === 'ArrowRight') next = (index + 1) % documents.length;
                else if (event.key === 'ArrowLeft')
                  next = (index + documents.length - 1) % documents.length;
                else if (event.key === 'Home') next = 0;
                else if (event.key === 'End') next = documents.length - 1;
                else return;
                event.preventDefault();
                event.stopPropagation();
                onSelect(documents[next].id);
                tabs.current.get(documents[next].id)?.focus();
              }}
            >
              {document.mode === 'game' ? <Gamepad2 size={14} /> : <Workflow size={14} />}
              <span>{document.name || 'Untitled tree'}</span>
            </button>
            {documents.length > 1 && (
              <button
                className="project-tab-close"
                aria-label={`Close ${document.name || 'Untitled tree'}`}
                title="Close tree"
                tabIndex={document.id === activeId ? 0 : -1}
                onClick={() => onClose(document.id)}
              >
                <X size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
      <IconButton className="new-project-button" label="New tree" onClick={onCreate}>
        <Plus size={18} />
      </IconButton>
    </div>
  );
}
