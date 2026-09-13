import { Request, Response } from 'express';
import mongoose from 'mongoose';
import ClassModel, { IClass } from '../models/class.model';
import Student from '../models/student.model';
import Course from '../models/course.model';
import CourseContent from '../models/course-content.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError } from '../utils/api-error';
import { resolveOrgIdForCreate } from '../utils/tenant-scope';
import { completeStudentEnrollmentHistory, reassignStudentClassCourses } from '../services/enrollment.service';

type StudentAction = 'promote' | 'repeat' | 'graduate';

function academicYearStart(value: string): number | null {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{4})$/);
  if (!match) return null;
  const start = Number(match[1]);
  return Number(match[2]) === start + 1 ? start : null;
}

function previousAcademicYear(target: string): string | null {
  const start = academicYearStart(target);
  return start === null ? null : `${start - 1}-${start}`;
}

function suggestedAcademicYear(years: string[]): string {
  const starts = years.map(academicYearStart).filter((x): x is number => x !== null);
  const start = starts.length ? Math.max(...starts) + 1 : new Date().getFullYear();
  return `${start}-${start + 1}`;
}

function gradeBounds(classes: Array<{ gradeLevel?: number | null }>) {
  const values = classes.map((x) => x.gradeLevel).filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  const unique = [...new Set(values)];
  return { min: unique.length ? Math.min(...unique) : null, max: unique.length ? Math.max(...unique) : null, count: unique.length };
}

async function getSchoolId(req: Request): Promise<string> {
  const requested = req.method === 'GET' ? req.query.schoolId : req.body?.schoolId;
  const resolved = resolveOrgIdForCreate(req, requested as string | undefined);
  if (!resolved) throw new BadRequestError('An organization must be selected');
  return String(resolved);
}

function classQueryBase(schoolId: string, source: any, targetAcademicYear: string, gradeLevel: number) {
  const query: Record<string, unknown> = {
    school: schoolId,
    department: source.department,
    gradeLevel,
    academicYear: targetAcademicYear,
    status: { $ne: 'completed' },
  };
  if (String(source.section || '').trim()) query.section = String(source.section).trim();
  return query;
}

async function publishedCourseCount(schoolId: string, classId: mongoose.Types.ObjectId) {
  return Course.countDocuments({ school: schoolId, class: classId, status: 'published' });
}

function cloneableCourse(sourceCourse: any, targetClassId: mongoose.Types.ObjectId, schoolId: string) {
  const raw = sourceCourse.toObject() as Record<string, any>;
  delete raw._id; delete raw.__v; delete raw.createdAt; delete raw.updatedAt;
  raw.school = new mongoose.Types.ObjectId(schoolId);
  raw.class = targetClassId;
  raw.slug = `${String(sourceCourse.slug || 'course')}-${targetClassId.toString().slice(-6)}-${new mongoose.Types.ObjectId().toString().slice(-6)}`;
  raw.enrolledStudents = 0; raw.isLive = false; raw.meetingLink = ''; raw.startDate = null; raw.endDate = null;
  return raw;
}

async function cloneCurriculum(schoolId: string, sourceClassId: mongoose.Types.ObjectId, targetClassId: mongoose.Types.ObjectId) {
  const sourceCourses = await Course.find({ school: schoolId, class: sourceClassId, status: 'published' });
  let copied = 0;
  for (const sourceCourse of sourceCourses) {
    const created = await Course.create(cloneableCourse(sourceCourse, targetClassId, schoolId));
    const content = await CourseContent.findOne({ course: sourceCourse._id }).lean() as Record<string, any> | null;
    if (content) {
      const next = { ...content, course: created._id } as Record<string, any>;
      delete next._id; delete next.__v; delete next.createdAt; delete next.updatedAt;
      await CourseContent.create(next);
    }
    copied += 1;
  }
  return copied;
}

async function findTemplate(schoolId: string, source: any, gradeLevel: number) {
  const candidates = await ClassModel.find({
    school: schoolId,
    department: source.department,
    gradeLevel,
    academicYear: source.academicYear,
    status: { $in: ['active', 'completed'] },
  }).sort({ createdAt: 1 });
  if (!candidates.length) return null;
  const section = String(source.section || '').trim().toLowerCase();
  return candidates.find((x) => String(x.section || '').trim().toLowerCase() === section) || candidates[0];
}

async function ensureNextGradeTarget(schoolId: string, source: mongoose.HydratedDocument<IClass>, targetAcademicYear: string) {
  const gradeLevel = Number(source.gradeLevel) + 1;
  const query = classQueryBase(schoolId, source, targetAcademicYear, gradeLevel);
  if (String(source.batch || '').trim()) query.batch = String(source.batch).trim();
  let target = await ClassModel.findOne(query).sort({ createdAt: 1 });
  const template = await findTemplate(schoolId, source, gradeLevel);
  let created = false;
  if (!target) {
    target = await ClassModel.create({
      school: source.school, department: source.department, title: template?.title || `Grade ${gradeLevel}`,
      section: source.section || template?.section || '', room: template?.room || source.room,
      capacity: template?.capacity ?? source.capacity ?? null, shiftMode: template?.shiftMode || source.shiftMode || 'Morning',
      status: 'active', batch: source.batch || '', gradeLevel, academicYear: targetAcademicYear,
      isGraduatingGrade: !!template?.isGraduatingGrade, isEntryGrade: false, promotedAt: null, promotedTo: null,
    });
    created = true;
  }
  let coursesCopied = 0;
  if ((await publishedCourseCount(schoolId, target._id as mongoose.Types.ObjectId)) === 0 && template) {
    coursesCopied = await cloneCurriculum(schoolId, template._id as mongoose.Types.ObjectId, target._id as mongoose.Types.ObjectId);
  }
  return { target, created, coursesCopied };
}

async function ensureRepeatTarget(schoolId: string, source: mongoose.HydratedDocument<IClass>, targetAcademicYear: string) {
  const query = classQueryBase(schoolId, source, targetAcademicYear, Number(source.gradeLevel));
  if (String(source.batch || '').trim()) query.batch = String(source.batch).trim();
  let target = await ClassModel.findOne(query).sort({ createdAt: 1 });
  let created = false;
  if (!target) {
    target = await ClassModel.create({
      school: source.school, department: source.department, title: source.title, section: source.section || '', room: source.room,
      capacity: source.capacity ?? null, shiftMode: source.shiftMode || 'Morning', status: 'active', batch: source.batch || '',
      gradeLevel: source.gradeLevel, academicYear: targetAcademicYear, isGraduatingGrade: !!source.isGraduatingGrade,
      isEntryGrade: false, promotedAt: null, promotedTo: null,
    });
    created = true;
  }
  let coursesCopied = 0;
  if ((await publishedCourseCount(schoolId, target._id as mongoose.Types.ObjectId)) === 0) {
    coursesCopied = await cloneCurriculum(schoolId, source._id as mongoose.Types.ObjectId, target._id as mongoose.Types.ObjectId);
  }
  return { target, created, coursesCopied };
}

async function ensureEntryIntake(schoolId: string, source: mongoose.HydratedDocument<IClass>, targetAcademicYear: string) {
  const start = academicYearStart(targetAcademicYear);
  const targetBatch = start === null ? targetAcademicYear : String(start);
  const query = classQueryBase(schoolId, source, targetAcademicYear, Number(source.gradeLevel));
  query.batch = targetBatch;
  let target = await ClassModel.findOne(query).sort({ createdAt: 1 });
  let created = false;
  if (!target) {
    target = await ClassModel.create({
      school: source.school, department: source.department, title: source.title, section: source.section || '', room: source.room,
      capacity: source.capacity ?? null, shiftMode: source.shiftMode || 'Morning', status: 'active', batch: targetBatch,
      gradeLevel: source.gradeLevel, academicYear: targetAcademicYear, isGraduatingGrade: false, isEntryGrade: true,
      promotedAt: null, promotedTo: null,
    });
    created = true;
  } else if (!target.isEntryGrade) {
    target.isEntryGrade = true;
    await target.save();
  }
  let coursesCopied = 0;
  if ((await publishedCourseCount(schoolId, target._id as mongoose.Types.ObjectId)) === 0) {
    coursesCopied = await cloneCurriculum(schoolId, source._id as mongoose.Types.ObjectId, target._id as mongoose.Types.ObjectId);
  }
  return { created, coursesCopied };
}

async function sourceContext(schoolId: string, targetAcademicYear: string) {
  const sourceAcademicYear = previousAcademicYear(targetAcademicYear);
  if (!sourceAcademicYear) throw new BadRequestError('Academic year must use YYYY-YYYY, for example 2027-2028.');
  const classes = await ClassModel.find({
    school: schoolId, academicYear: sourceAcademicYear, status: 'active', gradeLevel: { $ne: null }, promotedAt: null,
  }).sort({ gradeLevel: 1, title: 1, section: 1 });
  const bounds = gradeBounds(classes);
  const canInfer = bounds.count > 1;
  const hasEntry = classes.some((x) => !!x.isEntryGrade);
  const hasFinal = classes.some((x) => !!x.isGraduatingGrade);
  const isEntry = (cls: any) => !!cls.isEntryGrade || (!hasEntry && canInfer && bounds.min !== null && cls.gradeLevel === bounds.min);
  const isFinal = (cls: any) => !!cls.isGraduatingGrade || (!hasFinal && canInfer && bounds.max !== null && cls.gradeLevel === bounds.max);
  return { sourceAcademicYear, classes, isEntry, isFinal };
}

export const getPromotionReview = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = await getSchoolId(req);
  const years = await ClassModel.find({ school: schoolId, status: 'active' }).select('academicYear').lean();
  const requested = String(req.query.targetAcademicYear || '').trim();
  const targetAcademicYear = requested || suggestedAcademicYear(years.map((x) => x.academicYear || '').filter(Boolean));
  const context = await sourceContext(schoolId, targetAcademicYear);
  const groups = [] as any[];

  for (const cls of context.classes) {
    const isFinal = context.isFinal(cls);
    const students = await Student.find({ class: cls._id, status: 'active' })
      .select('_id studentId profile').populate('profile', 'firstName lastName').sort({ studentId: 1 }).lean();
    groups.push({
      classId: cls._id, title: cls.title, section: cls.section, gradeLevel: cls.gradeLevel, isFinal,
      targetGradeLevel: isFinal ? null : Number(cls.gradeLevel) + 1,
      targetTitle: isFinal ? 'Graduate' : `Grade ${Number(cls.gradeLevel) + 1}`,
      students: students.map((student: any) => ({
        _id: student._id, studentId: student.studentId,
        name: `${student.profile?.firstName || ''} ${student.profile?.lastName || ''}`.trim(),
        defaultAction: isFinal ? 'graduate' : 'promote',
      })),
    });
  }

  return ApiResponse.success(res, { sourceAcademicYear: context.sourceAcademicYear, targetAcademicYear, groups });
};

export const promoteReviewed = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = await getSchoolId(req);
  const targetAcademicYear = String(req.body?.targetAcademicYear || '').trim();
  if (!targetAcademicYear) throw new BadRequestError('Target academic year is required');
  const context = await sourceContext(schoolId, targetAcademicYear);
  const rawDecisions = Array.isArray(req.body?.decisions) ? req.body.decisions : [];
  const decisions = new Map<string, StudentAction>();
  for (const item of rawDecisions) {
    const studentId = String(item?.studentId || '');
    const action = String(item?.action || '') as StudentAction;
    if (!mongoose.isValidObjectId(studentId) || !['promote', 'repeat', 'graduate'].includes(action)) throw new BadRequestError('Invalid student promotion decision');
    decisions.set(studentId, action);
  }

  const classIds = context.classes.map((x) => x._id);
  const allStudents = await Student.find({ class: { $in: classIds }, status: 'active' }).select('_id class').lean();
  const validStudentIds = new Set(allStudents.map((x) => String(x._id)));
  for (const studentId of decisions.keys()) if (!validStudentIds.has(studentId)) throw new BadRequestError('A promotion decision references a student outside the source classes');

  const byClass = new Map<string, typeof allStudents>();
  for (const student of allStudents) {
    const key = String(student.class);
    const list = byClass.get(key) || [];
    list.push(student);
    byClass.set(key, list);
  }

  let studentsPromoted = 0, studentsRepeated = 0, studentsGraduated = 0, classesCompleted = 0;
  let targetsCreated = 0, repeatClassesCreated = 0, intakesOpened = 0, coursesCopied = 0;

  for (const cls of context.classes) {
    const students = byClass.get(String(cls._id)) || [];
    const isFinal = context.isFinal(cls);
    let promotionTarget: mongoose.HydratedDocument<IClass> | null = null;
    let repeatTarget: mongoose.HydratedDocument<IClass> | null = null;

    for (const student of students) {
      const requested = decisions.get(String(student._id)) || (isFinal ? 'graduate' : 'promote');
      if (isFinal && requested === 'promote') throw new BadRequestError(`Final grade students cannot be promoted beyond ${cls.title}; choose Graduate or Repeat.`);
      if (!isFinal && requested === 'graduate') throw new BadRequestError(`Only final grade students can be graduated; ${cls.title} must use Promote or Repeat.`);

      if (requested === 'graduate') {
        await Student.updateOne({ _id: student._id, status: 'active' }, { $set: { status: 'graduated' } });
        await completeStudentEnrollmentHistory(student._id, 'graduated');
        studentsGraduated += 1;
      } else if (requested === 'repeat') {
        if (!repeatTarget) {
          const info = await ensureRepeatTarget(schoolId, cls, targetAcademicYear);
          repeatTarget = info.target;
          if (info.created) repeatClassesCreated += 1;
          coursesCopied += info.coursesCopied;
        }
        await reassignStudentClassCourses(student._id, cls._id, repeatTarget._id);
        studentsRepeated += 1;
      } else {
        if (!promotionTarget) {
          const info = await ensureNextGradeTarget(schoolId, cls, targetAcademicYear);
          promotionTarget = info.target;
          if (info.created) targetsCreated += 1;
          coursesCopied += info.coursesCopied;
        }
        await reassignStudentClassCourses(student._id, cls._id, promotionTarget._id);
        studentsPromoted += 1;
      }
    }

    cls.promotedAt = new Date();
    cls.promotedTo = promotionTarget?._id as mongoose.Types.ObjectId | undefined;
    cls.status = 'completed';
    await cls.save();
    classesCompleted += 1;
  }

  for (const cls of context.classes.filter((x) => context.isEntry(x))) {
    const info = await ensureEntryIntake(schoolId, cls, targetAcademicYear);
    if (info.created) intakesOpened += 1;
    coursesCopied += info.coursesCopied;
  }

  return ApiResponse.success(res, {
    sourceAcademicYear: context.sourceAcademicYear, targetAcademicYear,
    studentsPromoted, studentsRepeated, studentsGraduated, classesCompleted,
    targetsCreated, repeatClassesCreated, intakesOpened, coursesCopied,
  }, `Promotion complete: ${studentsPromoted} promoted, ${studentsRepeated} repeating, ${studentsGraduated} graduated.`);
};
