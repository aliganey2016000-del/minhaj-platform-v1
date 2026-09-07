import { useEffect, useState } from 'react';
import { BookOpen, GraduationCap, Layers3 } from 'lucide-react';
import { useParams } from 'react-router-dom';
import api from '../../../lib/axios';
import { CourseBuilder } from './course-builder';
import { type InstitutionType, resolveInstitutionType } from '../../../lib/institution-type';

type Course = { title?: { en?: string }; school?: string | { _id?: string; name?: string } };
type Org = { _id: string; name: string; institutionType?: InstitutionType; organizationType?: InstitutionType };

const config: Record<InstitutionType, { label: string; hierarchy: string; model: string; description: string }> = {
  school: {
    label: 'School Curriculum',
    hierarchy: 'Grade → Class → Section → Course / Subject',
    model: 'Subject → Modules → Lessons → Quizzes / Assignments / Exams',
    description: 'Content is organized around school subjects and the assigned class or section.',
  },
  college: {
    label: 'College Curriculum',
    hierarchy: 'Department → Program → Cohort / Class → Course',
    model: 'Course → Modules → Lessons → Quizzes / Assignments / Exams',
    description: 'Content is organized by program-level courses and learner cohorts.',
  },
  university: {
    label: 'University Curriculum',
    hierarchy: 'Faculty → Department → Program → Cohort / Class → Course',
    model: 'Course → Modules → Lessons → Quizzes / Assignments / Exams',
    description: 'Content is organized by academic program, cohort and course; semester context remains owned by the academic structure.',
  },
  training_center: {
    label: 'Training Curriculum',
    hierarchy: 'Program → Course / Module → Batch / Cohort → Learners',
    model: 'Course / Module → Lessons → Practical Tasks → Quizzes / Assessments',
    description: 'Content is organized around training programs, practical modules and learner batches rather than school grades.',
  },
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

  return <div className="space-y-3">
    <div className="mx-4 mt-4 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 sm:mx-6">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary-50 p-2.5"><GraduationCap className="h-5 w-5 text-primary-600" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-600">{current.label}</p>
          <h1 className="mt-0.5 truncate text-base font-bold">{course?.title?.en || 'Course Curriculum'}</h1>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{current.description}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-[var(--color-surface-tertiary)] p-3"><div className="flex items-center gap-2 text-xs font-semibold"><Layers3 className="h-4 w-4" /> Academic hierarchy</div><p className="mt-1 text-xs text-[var(--color-text-secondary)]">{current.hierarchy}</p></div>
        <div className="rounded-xl bg-[var(--color-surface-tertiary)] p-3"><div className="flex items-center gap-2 text-xs font-semibold"><BookOpen className="h-4 w-4" /> Curriculum model</div><p className="mt-1 text-xs text-[var(--color-text-secondary)]">{current.model}</p></div>
      </div>
    </div>
    <CourseBuilder />
  </div>;
}
