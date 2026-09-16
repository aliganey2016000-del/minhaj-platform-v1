import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router-dom';
import api from '../../../lib/axios';
import { CourseBuilder } from './course-builder';

type CourseMeta = {
  title?: { en?: string; so?: string; ar?: string };
  class?: string | { _id?: string; title?: string; section?: string };
};

export function InstitutionCourseBuilder() {
  const { courseId } = useParams<{ courseId: string }>();
  const rootRef = useRef<HTMLDivElement>(null);
  const bypassActionInterceptRef = useRef(false);
  const [course, setCourse] = useState<CourseMeta | null>(null);
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!courseId) return;

    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/courses/${courseId}/admin`);
        if (!cancelled) setCourse(data.data || data);
      } catch {
        // Course Builder remains usable even if metadata fails to load.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [courseId]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const heading = rootRef.current?.querySelector('h1');
      if (heading?.parentElement) setHeaderTarget(heading.parentElement);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let openMenu: HTMLDivElement | null = null;
    let openActionZone: HTMLElement | null = null;

    const closeMenu = () => {
      openMenu?.remove();
      openMenu = null;
      openActionZone = null;
    };

    const findActionZone = (target: Element) => {
      const row = target.closest('.group.rounded-xl.border.p-3') as HTMLElement | null;
      if (!row) return null;

      // The compact mobile design uses the three-dot menu specifically for
      // lesson and quiz cards. Other item types retain their existing actions.
      const rowText = row.textContent || '';
      if (!rowText.includes('Lesson') && !rowText.includes('Quiz')) return null;

      const directChildren = Array.from(row.children) as HTMLElement[];
      const actionZone = directChildren.find((child) =>
        child.classList.contains('flex') &&
        child.classList.contains('items-center') &&
        child.classList.contains('gap-1'),
      );

      return actionZone || null;
    };

    const buildMenu = (actionZone: HTMLElement) => {
      const sourceButtons = Array.from(actionZone.querySelectorAll('button')) as HTMLButtonElement[];
      if (sourceButtons.length < 3) return;

      const rect = actionZone.getBoundingClientRect();
      const menu = document.createElement('div');
      menu.setAttribute('role', 'menu');
      menu.setAttribute('aria-label', 'Item actions');
      menu.style.position = 'fixed';
      menu.style.zIndex = '10000';
      menu.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - 154)}px`;
      menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
      menu.style.width = '176px';
      menu.style.padding = '6px';
      menu.style.border = '1px solid var(--color-border-default)';
      menu.style.borderRadius = '12px';
      menu.style.background = 'var(--color-surface-primary)';
      menu.style.boxShadow = '0 12px 30px rgba(15, 23, 42, 0.18)';

      const statusTitle = sourceButtons[1]?.title || 'Publish';
      const actions = [
        { label: '✏️ Edit', source: sourceButtons[0], danger: false },
        {
          label: statusTitle === 'Unpublish' ? '📥 Unpublish' : '📤 Publish',
          source: sourceButtons[1],
          danger: false,
        },
        { label: '🗑️ Delete', source: sourceButtons[2], danger: true },
      ];

      actions.forEach(({ label, source, danger }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'menuitem');
        button.textContent = label;
        button.style.display = 'flex';
        button.style.alignItems = 'center';
        button.style.width = '100%';
        button.style.minHeight = '42px';
        button.style.padding = '9px 11px';
        button.style.border = '0';
        button.style.borderRadius = '9px';
        button.style.background = 'transparent';
        button.style.color = danger ? '#dc2626' : 'var(--color-text-secondary)';
        button.style.fontSize = '13px';
        button.style.fontWeight = danger ? '700' : '600';
        button.style.textAlign = 'left';
        button.style.cursor = 'pointer';

        button.addEventListener('mouseenter', () => {
          button.style.background = danger ? 'rgba(220, 38, 38, 0.08)' : 'var(--color-surface-tertiary)';
        });
        button.addEventListener('mouseleave', () => {
          button.style.background = 'transparent';
        });
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          closeMenu();
          bypassActionInterceptRef.current = true;
          source.click();
          bypassActionInterceptRef.current = false;
        });

        menu.appendChild(button);
      });

      document.body.appendChild(menu);
      openMenu = menu;
      openActionZone = actionZone;
      menu.querySelector<HTMLButtonElement>('button')?.focus();
    };

    const onDocumentClickCapture = (event: MouseEvent) => {
      if (bypassActionInterceptRef.current) return;

      const target = event.target as Element | null;
      const root = rootRef.current;
      if (!target || !root) return;

      if (openMenu?.contains(target)) return;

      if (!root.contains(target)) {
        closeMenu();
        return;
      }

      const actionZone = findActionZone(target);
      if (!actionZone || !actionZone.contains(target)) {
        closeMenu();
        return;
      }

      // Intercept the hidden inline buttons before React handles them. On
      // mobile, the visible three-dot affordance opens this action menu.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (openMenu && openActionZone === actionZone) {
        closeMenu();
        return;
      }

      closeMenu();
      buildMenu(actionZone);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };

    const onViewportChange = () => closeMenu();

    document.addEventListener('click', onDocumentClickCapture, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);

    return () => {
      closeMenu();
      document.removeEventListener('click', onDocumentClickCapture, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, []);

  const courseName = course?.title?.en || course?.title?.so || course?.title?.ar || '';
  const classInfo = typeof course?.class === 'object' ? course.class : null;
  const className = classInfo?.title || '';
  const section = classInfo?.section?.trim();
  const classLabel = className ? `${className}${section ? ` - ${section}` : ''}` : '';

  return (
    <div ref={rootRef} className="institution-course-builder-approved">
      <CourseBuilder />
      {headerTarget && (courseName || classLabel) && createPortal(
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--color-text-tertiary)]">
          {courseName && (
            <span>
              <span className="font-semibold text-[var(--color-text-secondary)]">Course:</span> {courseName}
            </span>
          )}
          {courseName && classLabel && <span aria-hidden="true">•</span>}
          {classLabel && (
            <span>
              <span className="font-semibold text-[var(--color-text-secondary)]">Class:</span> {classLabel}
            </span>
          )}
        </div>,
        headerTarget,
      )}
    </div>
  );
}
