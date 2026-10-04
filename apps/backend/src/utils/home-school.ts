import Student from '../models/student.model';
import Teacher from '../models/teacher.model';
import Parent from '../models/parent.model';

/** The school an account belongs to, whatever its approval state. */
export async function homeSchoolId(user: any): Promise<string | undefined> {
  if (user.role === 'student') {
    const student = await Student.findOne({ user: user._id }).select('school').lean();
    if (student?.school) return student.school.toString();
  }
  if (user.organizationId) return (user.organizationId._id ?? user.organizationId).toString();
  if (user.role === 'teacher' || user.role === 'parent') {
    const Model: any = user.role === 'teacher' ? Teacher : Parent;
    const record = await Model.findOne({ user: user._id }).select('school').lean();
    if (record?.school) return record.school.toString();
  }
  return undefined;
}
