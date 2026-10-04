import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router-dom';
import api from '../../../lib/axios';
import { CourseBuilder } from './course-builder';
import { useCourseBuilderMobileMenu } from '../../shared/hooks/use-course-builder-mobile-menu';

type CourseMeta = {
  title?: { en?: string; so?: string; ar?: string };
  class?: string | { _id?: string; title?: string; section?: string };
};

export function InstitutionCourseBuilder() {
  const { courseId } = useParams<{ courseId: string }>();
  const rootRef = useRef<HTMLDivElement>(null);
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

  useCourseBuilderMobileMenu(rootRef);

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
