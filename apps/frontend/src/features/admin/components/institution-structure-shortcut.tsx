import { Building2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export function InstitutionStructureShortcut() {
  return (
    <Link
      to="/admin/hr?tab=structure"
      title="Institution Structure"
      aria-label="Institution Structure"
      className="fixed left-2 top-[19.75rem] z-[60] flex h-11 w-[calc(18rem-1rem)] items-center gap-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 text-sm font-semibold text-[var(--color-text-secondary)] shadow-lg transition-colors hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] lg:left-2 lg:top-[6.5rem] lg:z-[45] lg:w-[calc(18rem-1rem)]"
    >
      <Building2 className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={1.75} />
      <span className="truncate">Institution Structure</span>
    </Link>
  );
}
