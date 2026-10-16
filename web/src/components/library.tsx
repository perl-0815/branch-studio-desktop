'use client';
import { useState } from 'react';
import { Search, ChevronDown, ChevronRight, GripVertical, Plus } from 'lucide-react';
import { definitions } from '@/lib/registry';
import { useEditorStore } from '@/lib/store';
import { useI18n } from '@/lib/i18n';
import type { NodeKind } from '@/lib/types';
import { nodeCategories } from '@/generated/contracts.generated';
import NodeIcon from './node-icon';
export default function Library({ onAdd }: { onAdd: (kind: NodeKind) => void }) {
  const { t } = useI18n();
  const mode = useEditorStore((s) => s.project.mode);
  const [search, setSearch] = useState('');
  const [closed, setClosed] = useState<string[]>([]);
  const groups = nodeCategories.filter(
    (category) =>
      category !== 'Structure' &&
      definitions.some(
        (definition) => definition.category === category && definition.modes.includes(mode),
      ),
  );
  const matchesSearch = (definition: (typeof definitions)[number]) =>
    `${definition.label} ${definition.description} ${definition.aliases} ${definition.category} ${t(definition.label)} ${t(definition.description)} ${t(definition.category)}`
      .toLowerCase()
      .includes(search.toLowerCase());
  return (
    <aside className="library">
      <div className="panel-heading">
        <span>{t('NODE LIBRARY')}</span>
        <span className="count">
          {definitions.filter((d) => d.modes.includes(mode) && d.kind !== 'Root').length}
        </span>
      </div>
      <div className="search-box">
        <Search size={14} />
        <input
          aria-label={t('Search node library')}
          placeholder={t('Find a node...')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <kbd>/</kbd>
      </div>
      <div className="library-scroll">
        {groups.map((group) => {
          const items = definitions.filter(
            (d) => d.category === group && d.modes.includes(mode) && matchesSearch(d),
          );
          if (!items.length) return null;
          const isClosed = closed.includes(group) && !search;
          return (
            <div className="library-group" key={group}>
              <button
                className="group-title"
                onClick={() =>
                  setClosed((c) =>
                    c.includes(group) ? c.filter((x) => x !== group) : [...c, group],
                  )
                }
              >
                {isClosed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                <span>{t(group)}</span>
                <small>{items.length}</small>
              </button>
              {!isClosed &&
                items.map((def) => (
                  <button
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/branch-node', def.kind);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => onAdd(def.kind)}
                    key={def.kind}
                    title={`${t(def.description)} · ${t('Click or drag to add')}`}
                    className="library-node"
                    data-testid={`add-${def.kind}`}
                  >
                    <span className="library-node-icon" style={{ color: def.color }}>
                      <NodeIcon kind={def.kind} />
                    </span>
                    <span>{t(def.label)}</span>
                    <GripVertical size={12} className="drag-grip" />
                    <Plus size={12} className="add-glyph" />
                  </button>
                ))}
            </div>
          );
        })}
        {search &&
          !definitions.some(
            (d) => d.kind !== 'Root' && d.modes.includes(mode) && matchesSearch(d),
          ) && <div className="empty-small">{t('No matching nodes')}</div>}
      </div>
      <div className="library-footer">
        <kbd>Space</kbd>
        <span>{t('Quick add')}</span>
      </div>
    </aside>
  );
}
