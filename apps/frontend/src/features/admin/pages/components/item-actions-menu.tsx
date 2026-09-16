import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

export function ItemActionsMenu({ status, onEdit, onToggleStatus, onDelete }: {
  status: 'draft' | 'published';
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node) && !btnRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return <>
    <button ref={btnRef} type="button" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} className="h-8 w-8 flex items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors" title="Item actions">
      <MoreVertical className="h-4 w-4" strokeWidth={1.75} />
    </button>
    {open && btnRef.current && createPortal(
      <div ref={menuRef} style={{ position: 'fixed', top: btnRef.current.getBoundingClientRect().bottom + 4, right: window.innerWidth - btnRef.current.getBoundingClientRect().right, zIndex: 100 }} className="w-44 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-elevated py-1">
        <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Status: {status}</div>
        <div className="border-t border-[var(--color-border-subtle)]" />
        <button onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit(); }} className="w-full text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]">✏️ Edit</button>
        <button onClick={(e) => { e.stopPropagation(); setOpen(false); onToggleStatus(); }} className="w-full text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]">{status === 'published' ? '📥 Unpublish' : '📤 Publish'}</button>
        <button onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(); }} className="w-full text-left px-4 py-2.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20">🗑️ Delete</button>
      </div>, document.body)}
  </>;
}
