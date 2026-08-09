/**
 * Excel-style column header filter — click a column header (in any admin
 * data table) to get a dropdown with Sort A→Z / Z→A, a search box, and a
 * checkbox list of every unique value in that column (with a "(Select All)"
 * toggle). Selections are staged locally and only take effect on OK, exactly
 * like Excel's own AutoFilter dropdown — Cancel discards, Clear removes any
 * filter/sort on that column.
 *
 * Pairs with the useColumnFilters hook below, which owns the actual
 * filter/sort state and derives the filtered+sorted row list — a page just
 * provides `{ colKey: (row) => string }` accessors for whichever columns
 * should be filterable.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ArrowUp, ArrowDown, Search, X } from 'lucide-react';

export type ColumnFilterValue = Set<string> | null;
export type ColumnSort = 'asc' | 'desc' | null;

// Opt-in — when a page passes this as useColumnFilters' 3rd argument, the
// hook stops filtering/sorting `rows` itself (the page is expected to pass
// already server-filtered rows) and instead reports every committed change
// here so the page can turn it into a real API request. Local
// columnFilters/sortCol/sortDir state is still tracked either way, since the
// dropdown UI (checked boxes, active-sort highlight) reads from it.
export interface ColumnFiltersServerConfig {
  onChange: (state: { filters: Record<string, string[]>; sortBy: string | null; sortDir: 'asc' | 'desc' }) => void;
}

// ---------------------------------------------------------------------------
// useColumnFilters — generic filter/sort state + derived row list for any
// row type, given a map of column key -> string accessor. Pass a
// `serverConfig` to make committed changes drive a server request instead of
// a local recompute (see ColumnFiltersServerConfig above).
// ---------------------------------------------------------------------------

export function useColumnFilters<T>(
  rows: T[],
  accessors: Record<string, (row: T) => string>,
  serverConfig?: ColumnFiltersServerConfig
) {
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilterValue>>({});
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const notifyServer = (nextFilters: Record<string, ColumnFilterValue>, nextSortCol: string | null, nextSortDir: 'asc' | 'desc') => {
    if (!serverConfig) return;
    const filters: Record<string, string[]> = {};
    for (const [key, val] of Object.entries(nextFilters)) {
      if (val) filters[key] = Array.from(val);
    }
    serverConfig.onChange({ filters, sortBy: nextSortCol, sortDir: nextSortDir });
  };

  const applyColumnCommit = (colKey: string, selected: ColumnFilterValue, sort: ColumnSort) => {
    const nextFilters = { ...columnFilters, [colKey]: selected };
    const nextSortCol = sort ? colKey : (sortCol === colKey ? null : sortCol);
    const nextSortDir = sort || sortDir;
    setColumnFilters(nextFilters);
    setSortCol(nextSortCol);
    if (sort) setSortDir(nextSortDir);
    notifyServer(nextFilters, nextSortCol, nextSortDir);
  };

  const clearColumnFilter = (colKey: string) => {
    const nextFilters = { ...columnFilters, [colKey]: null };
    const nextSortCol = sortCol === colKey ? null : sortCol;
    setColumnFilters(nextFilters);
    setSortCol(nextSortCol);
    notifyServer(nextFilters, nextSortCol, sortDir);
  };

  const clearAll = () => {
    setColumnFilters({});
    setSortCol(null);
    notifyServer({}, null, sortDir);
  };

  const displayedRows = useMemo(() => {
    if (serverConfig) return rows;
    let out = rows;
    for (const [colKey, selected] of Object.entries(columnFilters)) {
      if (!selected) continue;
      const accessor = accessors[colKey];
      if (!accessor) continue;
      out = out.filter((r) => selected.has(accessor(r)));
    }
    if (sortCol && accessors[sortCol]) {
      const accessor = accessors[sortCol];
      out = [...out].sort(
        (a, b) => accessor(a).localeCompare(accessor(b), undefined, { numeric: true, sensitivity: 'base' }) * (sortDir === 'asc' ? 1 : -1)
      );
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columnFilters, sortCol, sortDir, serverConfig]);

  const columnFiltersActive = Object.values(columnFilters).some((v) => v !== null && v !== undefined);

  return { columnFilters, sortCol, sortDir, applyColumnCommit, clearColumnFilter, clearAll, displayedRows, columnFiltersActive };
}

// ---------------------------------------------------------------------------
// ColumnFilterHeader — the clickable header + dropdown itself.
// ---------------------------------------------------------------------------

interface ColumnFilterHeaderProps {
  label: string;
  colKey: string;
  // Either pass allValues (unique values derived client-side, the original
  // behavior) or options (an explicit {value,label} list — e.g. every class
  // for the selected org, or a fixed enum — for a column whose real filter
  // value shouldn't depend on what happens to be loaded on the current page).
  allValues?: string[];
  options?: { value: string; label: string }[];
  currentSelected: ColumnFilterValue;
  currentSort: ColumnSort;
  onCommit: (colKey: string, selected: ColumnFilterValue, sort: ColumnSort) => void;
  onClear: (colKey: string) => void;
  align?: 'left' | 'center';
  // False hides the Sort A→Z / Z→A buttons — for columns backed by a
  // populated/joined field, which this component has no way to sort
  // server-side (that needs an aggregation pipeline, out of scope here).
  sortable?: boolean;
}

interface MenuStyle {
  top?: number;
  bottom?: number;
  left: number;
  maxHeight: number;
}

// Fixed sizing constants the positioning math is built around — kept in
// sync with the menu's own `w-64` (256px) class below.
const MENU_WIDTH = 256;
const MENU_GAP = 6;
const VIEWPORT_MARGIN = 8;
const MIN_PREFERRED_HEIGHT = 220;
const MAX_MENU_HEIGHT = 420;

export function ColumnFilterHeader({ label, colKey, allValues, options, currentSelected, currentSort, onCommit, onClear, align = 'left', sortable = true }: ColumnFilterHeaderProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [draftSelected, setDraftSelected] = useState<Set<string>>(new Set());
  const [draftSort, setDraftSort] = useState<ColumnSort>(null);
  const [menuStyle, setMenuStyle] = useState<MenuStyle>({ left: 0, maxHeight: MAX_MENU_HEIGHT });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const uniqueValues = useMemo(() => {
    if (options) return options.map((o) => o.value);
    return Array.from(new Set(allValues || [])).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }, [allValues, options]);

  const labelFor = (v: string) => (options ? options.find((o) => o.value === v)?.label ?? v : v);

  // Recomputes the portal's fixed position/size from the trigger button's
  // current viewport rect — flips above the button and clamps into the
  // viewport when there isn't room below, so the menu is never cut off.
  const reposition = () => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP;
    const spaceAbove = rect.top - MENU_GAP;
    const openUpward = spaceBelow < MIN_PREFERRED_HEIGHT && spaceAbove > spaceBelow;

    let left = align === 'center' ? rect.left + rect.width / 2 - MENU_WIDTH / 2 : rect.left;
    left = Math.min(Math.max(left, VIEWPORT_MARGIN), window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN);

    setMenuStyle(
      openUpward
        ? { bottom: window.innerHeight - rect.top + MENU_GAP, left, maxHeight: Math.min(MAX_MENU_HEIGHT, spaceAbove) }
        : { top: rect.bottom + MENU_GAP, left, maxHeight: Math.min(MAX_MENU_HEIGHT, spaceBelow) }
    );
  };

  const openMenu = () => {
    setDraftSelected(new Set(currentSelected ?? uniqueValues));
    setDraftSort(currentSort);
    setQuery('');
    reposition();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  // Keep the menu glued to its trigger while open — `scroll` is captured
  // (not just bubbled) so it also fires for the table's own horizontal
  // scroll container, not only window/page scrolling.
  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const visibleOptions = uniqueValues.filter((v) => labelFor(v).toLowerCase().includes(query.toLowerCase()));
  const allVisibleChecked = visibleOptions.length > 0 && visibleOptions.every((v) => draftSelected.has(v));

  const toggleAllVisible = () => {
    setDraftSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleChecked) visibleOptions.forEach((v) => next.delete(v));
      else visibleOptions.forEach((v) => next.add(v));
      return next;
    });
  };
  const toggleOne = (v: string) => {
    setDraftSelected((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  };

  const commit = () => {
    const selected = draftSelected.size < uniqueValues.length ? draftSelected : null;
    onCommit(colKey, selected, draftSort);
    setOpen(false);
  };

  const isActive = currentSelected !== null || currentSort !== null;

  return (
    <span className="relative inline-flex items-center gap-1">
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={`inline-flex items-center gap-1 rounded px-1 -mx-1 py-0.5 transition-colors ${isActive ? 'text-primary-600 dark:text-primary-400' : 'hover:text-primary-600 dark:hover:text-primary-400'}`}
      >
        {label}
        <ChevronDown className="h-3 w-3 flex-shrink-0" strokeWidth={2.5} />
        {isActive && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary-500" />}
      </button>

      {open && btnRef.current && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: menuStyle.top,
            bottom: menuStyle.bottom,
            left: menuStyle.left,
            maxHeight: menuStyle.maxHeight,
            zIndex: 100,
          }}
          className="flex w-64 flex-col rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-elevated overflow-hidden text-left"
        >
          {sortable && (
            <div className="flex-shrink-0 p-1.5 border-b border-[var(--color-border-subtle)]">
              <button
                type="button"
                onClick={() => setDraftSort((s) => (s === 'asc' ? null : 'asc'))}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${draftSort === 'asc' ? 'bg-primary-50 dark:bg-primary-950/30 text-primary-700 dark:text-primary-300' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}
              >
                <ArrowUp className="h-3.5 w-3.5" strokeWidth={2} /> Sort A → Z
              </button>
              <button
                type="button"
                onClick={() => setDraftSort((s) => (s === 'desc' ? null : 'desc'))}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${draftSort === 'desc' ? 'bg-primary-50 dark:bg-primary-950/30 text-primary-700 dark:text-primary-300' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}
              >
                <ArrowDown className="h-3.5 w-3.5" strokeWidth={2} /> Sort Z → A
              </button>
            </div>
          )}

          <div className="flex-shrink-0 p-2 border-b border-[var(--color-border-subtle)]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-tertiary)]" strokeWidth={2} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] pl-8 pr-2.5 py-1.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500/30"
              />
            </div>
          </div>

          <div className="min-h-[3rem] flex-1 overflow-y-auto p-2">
            <label className="flex items-center gap-2 px-1.5 py-1 text-xs font-semibold text-[var(--color-text-primary)] cursor-pointer">
              <input type="checkbox" checked={allVisibleChecked} onChange={toggleAllVisible} className="h-3.5 w-3.5 rounded border-[var(--color-border-default)] text-primary-600 focus:ring-primary-500/30" />
              (Select All)
            </label>
            {visibleOptions.map((v) => (
              <label key={v} className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs text-[var(--color-text-secondary)] cursor-pointer hover:bg-[var(--color-surface-tertiary)]">
                <input type="checkbox" checked={draftSelected.has(v)} onChange={() => toggleOne(v)} className="h-3.5 w-3.5 flex-shrink-0 rounded border-[var(--color-border-default)] text-primary-600 focus:ring-primary-500/30" />
                <span className="truncate">{labelFor(v) || '(Blanks)'}</span>
              </label>
            ))}
            {visibleOptions.length === 0 && <p className="px-1.5 py-2 text-xs text-[var(--color-text-tertiary)]">No matches</p>}
          </div>

          <div className="flex-shrink-0 flex items-center justify-between gap-2 p-2 border-t border-[var(--color-border-subtle)]">
            <button type="button" onClick={() => { onClear(colKey); setOpen(false); }} className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-text-tertiary)] hover:text-red-500 transition-colors">
              <X className="h-3 w-3" strokeWidth={2} /> Clear
            </button>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">Cancel</button>
              <button type="button" onClick={commit} className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 transition-colors">OK</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}

export default ColumnFilterHeader;
