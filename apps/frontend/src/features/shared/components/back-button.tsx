/**
 * Back Button — sub-page navigation affordance.
 *
 * Sub-pages reached via a sidebar submenu (e.g. Exam Management > Exam
 * Attendance) have no way back except the sidebar itself, which isn't
 * always obvious once scrolled or on a smaller screen. This uses the
 * browser's own history (navigate(-1)) so "Back" always means "wherever
 * the admin actually came from", falling back to a given route if there's
 * no history to go back to (e.g. the page was opened directly via URL).
 */

import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function BackButton({ fallback = '/admin', label = 'Back' }: { fallback?: string; label?: string }) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 -ml-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
    >
      <ArrowLeft className="h-4 w-4" strokeWidth={2} />
      {label}
    </button>
  );
}

export default BackButton;
