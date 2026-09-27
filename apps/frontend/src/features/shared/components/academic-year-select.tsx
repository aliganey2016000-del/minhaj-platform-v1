import type { SelectHTMLAttributes } from 'react';

export type AcademicYearFormat = 'long-dash' | 'short-slash';

export function formatAcademicYear(startYear: number, format: AcademicYearFormat = 'long-dash'): string {
  return format === 'short-slash'
    ? `${startYear}/${String(startYear + 1).slice(-2)}`
    : `${startYear}-${startYear + 1}`;
}

export function currentAcademicYear(format: AcademicYearFormat = 'long-dash'): string {
  const now = new Date();
  const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return formatAcademicYear(startYear, format);
}

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
  format?: AcademicYearFormat;
  options?: string[];
  yearsBack?: number;
  yearsForward?: number;
  placeholder?: string;
};

function yearStart(value: string): number {
  const match = String(value || '').match(/\d{4}/);
  return match ? Number(match[0]) : 0;
}

export function AcademicYearSelect({
  value,
  onChange,
  format = 'long-dash',
  options,
  yearsBack = 3,
  yearsForward = 5,
  placeholder = 'Select academic year...',
  className = '',
  ...props
}: Props) {
  const currentStart = yearStart(currentAcademicYear(format));
  const generated = Array.from(
    { length: yearsBack + yearsForward + 1 },
    (_, index) => formatAcademicYear(currentStart - yearsBack + index, format),
  );

  const values = Array.from(new Set([...(options || generated), value].filter(Boolean)))
    .sort((a, b) => yearStart(a) - yearStart(b) || a.localeCompare(b));

  return (
    <select
      {...props}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3.5 py-2.5 text-sm font-medium text-[var(--color-text-primary)] outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      <option value="">{placeholder}</option>
      {values.map((year) => (
        <option key={year} value={year}>{year}</option>
      ))}
    </select>
  );
}

export default AcademicYearSelect;
