import { useEffect, useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { useParams } from 'react-router-dom';
import api from '../../../lib/axios';
import { CourseBuilder } from './course-builder';
import { type InstitutionType, resolveInstitutionType } from '../../../lib/institution-type';

type Course = { title?: { en?: string }; school?: string | { _id?: string; name?: string } };
type Org = { _id: string; name: string; institutionType?: InstitutionType; organizationType?: InstitutionType };

const config: Record<InstitutionType, { label: string }> = {
  school: { label: 'School Curriculum' },
  college: { label: 'College Curriculum' },
  university: { label: 'University Curriculum' },
  training_center: { label: 'Training Curriculum' },
};

export function InstitutionCourseBuilder() {
  const { courseId } = useParams<{ courseId: string }>();
  const [org, setOrg] = useState<Org | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!courseId) return;
    (async () => {
      try {
        const courseRes = await api.get(`/courses/${courseId}/admin`);
        const rawCourse = courseRes.data.data || courseRes.data;
        setCourse(rawCourse);
        const schoolId = typeof rawCourse.school === 'object' ? rawCourse.school?._id : rawCourse.school;
        if (schoolId) {
          const orgRes = await api.get(`/schools/${schoolId}`);
          const rawOrg = orgRes.data.data || orgRes.data;
          setOrg(rawOrg);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [courseId]);

  const type = resolveInstitutionType(org);
  const current = config[type];

  if (loading) return <div className="p-6 text-sm text-[var(--color-text-tertiary)]">Loading curriculum...</div>;

  return (
    <div className="institution-course-builder-approved">
      <div className="course-context-compact mx-auto max-w-[1180px] px-4 pt-4 sm:px-6">
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3.5 shadow-sm">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-950/30">
            <GraduationCap className="h-5 w-5 text-primary-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="truncate text-sm font-bold text-[var(--color-text-primary)] sm:text-base">
                {course?.title?.en || 'Course Curriculum'}
              </h2>
              <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-950/30 dark:text-green-300">
                {current.label}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-[var(--color-text-tertiary)]">
              Build modules, lessons, quizzes, assignments and exams
            </p>
          </div>
        </div>
      </div>
      <CourseBuilder />
    </div>
  );
}
