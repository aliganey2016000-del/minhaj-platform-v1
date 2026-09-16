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
      <div className="course-builder-context-data" aria-label="Course curriculum context">
        <GraduationCap className="course-builder-context-icon" />
        <div className="course-builder-context-copy">
          <div className="course-builder-context-heading">
            <h2>{course?.title?.en || 'Course Curriculum'}</h2>
            <span>{current.label}</span>
          </div>
          <p>Build modules, lessons, quizzes, assignments.</p>
        </div>
      </div>
      <CourseBuilder />
    </div>
  );
}
