import { useMemo } from 'react';

type Row = { score?: number | null; maxScore?: number | null; status?: string };

export default function GradebookMobileSummary({ rows }: { rows: Row[] }) {
  const stats = useMemo(() => {
    const graded = rows.filter(r => r.score != null && r.maxScore);
    const average = graded.length
      ? Math.round(graded.reduce((sum, r) => sum + ((Number(r.score) / Number(r.maxScore)) * 100), 0) / graded.length)
      : 0;
    return { total: rows.length, graded: graded.length, average };
  }, [rows]);

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-3">
        <p className="text-[11px] text-[var(--color-text-secondary)]">Students</p>
        <p className="mt-1 text-lg font-bold">{stats.total}</p>
      </div>
      <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-3">
        <p className="text-[11px] text-[var(--color-text-secondary)]">Graded</p>
        <p className="mt-1 text-lg font-bold">{stats.graded}</p>
      </div>
      <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-3">
        <p className="text-[11px] text-[var(--color-text-secondary)]">Average</p>
        <p className="mt-1 text-lg font-bold text-emerald-600">{stats.average}%</p>
      </div>
    </div>
  );
}
