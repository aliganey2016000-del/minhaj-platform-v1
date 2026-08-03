/**
 * Searchable Select — a lightweight autocomplete combobox for picking one
 * option out of a (potentially long) list, e.g. a course name or a class,
 * without the admin having to scroll a native <select>. No external
 * dependency: a button that opens a small popover with a search input and a
 * filtered, keyboard-navigable option list (Arrow Up/Down + Enter, Escape to
 * close, click-outside to close).
 */
import { useEffect, useRef, useState } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';

export interface SearchableSelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  emptyMessage?: string;
  className?: string;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  searchPlaceholder = 'Type to search...',
  disabled,
  emptyMessage = 'No matches found.',
  className = '',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) || null;

  const filtered = query.trim()
    ? options.filter((o) => {
        const q = query.trim().toLowerCase();
        return o.label.toLowerCase().includes(q) || (o.sublabel || '').toLowerCase().includes(q);
      })
    : options;

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (open) {
      setHighlighted(0);
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => { setHighlighted(0); }, [query]);

  const commit = (opt: SearchableSelectOption) => {
    onChange(opt.value);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlighted]) commit(filtered[highlighted]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3.5 py-2.5 text-sm text-left focus:outline-none focus:ring-2 focus:ring-primary-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={`truncate ${selected ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)]'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 flex-shrink-0 text-[var(--color-text-tertiary)] transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={2} />
      </button>

      {open && !disabled && (
        <div className="absolute z-30 mt-1.5 w-full min-w-[16rem] rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 border-b border-[var(--color-border-subtle)] px-3 py-2">
            <Search className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-text-tertiary)]" strokeWidth={2} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-sm focus:outline-none text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="px-4 py-3 text-xs text-[var(--color-text-tertiary)]">{emptyMessage}</p>
            )}
            {filtered.map((opt, i) => (
              <button
                type="button"
                key={opt.value}
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => commit(opt)}
                className={`flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm transition-colors ${
                  i === highlighted ? 'bg-primary-50 dark:bg-primary-950/30' : ''
                } ${opt.value === value ? 'font-semibold text-primary-700 dark:text-primary-300' : 'text-[var(--color-text-primary)]'}`}
              >
                <span className="min-w-0">
                  <span className="block truncate">{opt.label}</span>
                  {opt.sublabel && <span className="block truncate text-xs text-[var(--color-text-tertiary)]">{opt.sublabel}</span>}
                </span>
                {opt.value === value && <Check className="h-4 w-4 flex-shrink-0 text-primary-600" strokeWidth={2.5} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default SearchableSelect;
