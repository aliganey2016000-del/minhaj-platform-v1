/**
 * Shared table pagination bar — "Showing X-Y of Z" + items-per-page selector
 * + Prev/Next with numbered page buttons (windowed with ellipses once there
 * are many pages). Used by every server-paginated admin list page so page
 * size and page-navigation behavior stay consistent across modules instead
 * of each page hand-rolling its own Prev/Next block.
 */
import type { ChangeEvent } from 'react';

export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  pageSizeOptions?: number[];
  /** Plural noun for the "Showing X-Y of Z {itemLabel}" line, e.g. "teachers". */
  itemLabel?: string;
}

// Windowed page-number list: always shows first/last page, the current page
// +/-1, and collapses everything else into a single "…" so the bar stays a
// fixed height no matter how many pages exist.
function getPageNumbers(current: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages: (number | 'ellipsis')[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(totalPages - 1, current + 1);
  if (left > 2) pages.push('ellipsis');
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < totalPages - 1) pages.push('ellipsis');
  pages.push(totalPages);
  return pages;
}

export function Pagination({ page, limit, total, onPageChange, onLimitChange, pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS, itemLabel = 'entries' }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  const handleLimitChange = (e: ChangeEvent<HTMLSelectElement>) => onLimitChange?.(Number(e.target.value));

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[var(--color-border-subtle)] px-4 sm:px-6 py-3">
      <div className="flex items-center gap-3 text-xs text-[var(--color-text-tertiary)]">
        <span>
          {total === 0 ? `No ${itemLabel}` : <>Showing <strong className="text-[var(--color-text-secondary)]">{start}-{end}</strong> of <strong className="text-[var(--color-text-secondary)]">{total}</strong> {itemLabel}</>}
        </span>
        <label className="flex items-center gap-1.5">
          <span className="hidden sm:inline">Show</span>
          <select
            value={limit}
            onChange={handleLimitChange}
            className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="Items per page"
          >
            {pageSizeOptions.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="hidden sm:inline">per page</span>
        </label>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← Prev
          </button>
          {getPageNumbers(page, totalPages).map((p, idx) =>
            p === 'ellipsis' ? (
              <span key={`ellipsis-${idx}`} className="px-1.5 text-xs text-[var(--color-text-tertiary)]">…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-current={p === page ? 'page' : undefined}
                className={`min-w-[28px] rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                  p === page
                    ? 'bg-primary-600 text-white'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'
                }`}
              >
                {p}
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
