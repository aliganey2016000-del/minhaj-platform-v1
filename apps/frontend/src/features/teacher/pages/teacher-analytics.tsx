/**
 * Teacher Analytics / Course Workspace entry point.
 *
 * /teacher/courses/:courseId is the course-scoped workspace. The standalone
 * /teacher/analytics page keeps the existing class analytics experience.
 */
import { useParams } from 'react-router-dom';
import TeacherCourseWorkspace from './teacher-course-workspace';
import TeacherClassAnalytics from './teacher-class-analytics';

export function TeacherAnalytics() {
  const { courseId } = useParams<{ courseId?: string }>();
  return courseId ? <TeacherCourseWorkspace /> : <TeacherClassAnalytics />;
}

export default TeacherAnalytics;
