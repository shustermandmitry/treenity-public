// FieldLabel — interactive label for Inspector fields
// Click → dropdown menu (value/$ref/$map + copy/clear), drop target for tree nodes

import { isRef } from '@treenity/core/core';
import { useEffect, useRef, useState } from 'react';

type FieldMode = 'value' | 'ref' | 'map';

function getFieldMode(v: unknown): FieldMode {
  if (v && typeof v === 'object' && isRef(v)) {
    return (v as { $map?: string }).$map !== undefined ? 'map' : 'ref';
  }
  return 'value';
}

const MODE_LABELS: Record<FieldMode, string> = { value: 'val', ref: '$ref', map: '$map' };

/** Interactive field label — click for mode menu, drop target for tree nodes */
export function FieldLabel({ label, value, onChange }: {
  label: string;
  value: unknown;
  onChange?: (next: unknown) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLLabelElement>(null);
  const mode = getFieldMode(value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  function switchMode(next: FieldMode) {
    setOpen(false);
    if (!onChange || next === mode) return;
    if (next === 'value') {
      onChange(0);
    } else if (next === 'ref') {
      onChange({ $ref: '.' });
    } else {
      const r = isRef(value) ? (value as { $ref: string }).$ref : '.';
      onChange({ $ref: r, $map: '' });
    }
  }

  function handleCopy() {
    setOpen(false);
    navigator.clipboard.writeText(JSON.stringify(value));
  }

  function handleClear() {
    setOpen(false);
    if (onChange) onChange(undefined);
  }

  // No onChange = read-only label, no menu
  if (!onChange) {
    return <label>{label}</label>;
  }

  return (
    <label
      ref={wrapRef}
      className={dragOver ? 'text-primary' : undefined}
      onClick={(e) => {
        e.preventDefault();
        setOpen(!open);
      }}
      style={{ cursor: 'pointer' }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/treenity-path')) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const path = e.dataTransfer.getData('application/treenity-path');
        if (path && onChange) {
          const existing = isRef(value) ? (value as { $map?: string }).$map : undefined;
          onChange(existing !== undefined ? { $ref: path, $map: existing } : { $ref: path });
        }
      }}
    >
      <span className="block overflow-hidden text-ellipsis">{label}</span>

      {open && (
        <div className="tree-menu" style={{ left: 0, right: 'auto' }}>
          {(['value', 'ref', 'map'] as FieldMode[]).map((m) => (
            <button
              key={m}
              className="tree-menu-item"
              onClick={(e) => { e.stopPropagation(); switchMode(m); }}
            >
              {mode === m ? '\u25CF ' : '  '}{MODE_LABELS[m]}
            </button>
          ))}
          <hr className="my-1 border-border/30" />
          <button className="tree-menu-item" onClick={(e) => { e.stopPropagation(); handleCopy(); }}>
            Copy
          </button>
          <button className="tree-menu-item" onClick={(e) => { e.stopPropagation(); handleClear(); }}>
            Clear
          </button>
        </div>
      )}
    </label>
  );
}

/** Inline ref/map editor — $ref + optional $map, compact single/double row */
export function RefEditor({ value, onChange }: {
  value: { $ref: string; $map?: string };
  onChange: (next: unknown) => void;
}) {
  const hasMap = value.$map !== undefined;

  return (
    <div className="flex flex-col gap-1 flex-1 min-w-0">
      <div className="flex items-center gap-1">
        <span className="text-[9px] text-muted-foreground shrink-0 w-5">$ref</span>
        <input
          className="flex-1 min-w-0"
          value={value.$ref}
          onChange={(e) => onChange(hasMap ? { $ref: e.target.value, $map: value.$map } : { $ref: e.target.value })}
          placeholder="path"
        />
      </div>
      {hasMap && (
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground shrink-0 w-5">$map</span>
          <input
            className="flex-1 min-w-0"
            value={value.$map ?? ''}
            onChange={(e) => onChange({ $ref: value.$ref, $map: e.target.value })}
            placeholder="field"
          />
        </div>
      )}
    </div>
  );
}
