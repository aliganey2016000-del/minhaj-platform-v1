import { Request, Response } from 'express';
import mongoose from 'mongoose';
import ClassModel, { IClass } from '../models/class.model';
import Student from '../models/student.model';
import Course from '../models/course.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { assertOwnsOrg, resolveOrgIdForCreate } from '../utils/tenant-scope';

interface PromotionGroup {
  classId: mongoose.Types.ObjectId;
  title: string;
  section?: string;
  gradeLevel: number;
  studentCount: number;
  action: 'promote-new' | 'promote-existing' | 'graduate' | 'already-promoted' | 'skipped';
  targetClassId?: mongoose.Types.ObjectId;
  targetTitle?: string;
  targetCourseCount?: number;
  sourceCourseCount?: number;
  opensNewIntake?: boolean;
  reason?: string;
}

function academicYearStart(value: string): number | null {
  const match = value.trim().match(/^(\d{4})-(\d{4})$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  return end === start + 1 ? start : null;
}

function suggestedAcademicYear(years: string[]): string {
  const starts = years.map(academicYearStart).filter((v): v is number => v !== null);
  const current = new Date().getFullYear();
  const start = starts.length ? Math.max(...starts) + 1 : current;
  return `${start}-${start + 1}`;
}

async function getScopedSchoolId(req: Request): Promise<string> {
  const requested = req.method === 'GET' ? req.query.schoolId : req.body?.schoolId;
  const resolved = resolveOrgIdForCreate(req, requested as string | undefined);
  if (!resolved) throw new BadRequestError('An organization must be selected');
  return String(resolved);
}

async function assertClassInOrg(req: Request, classId: mongoose.Types.ObjectId, schoolId: string) {
  const cls = await ClassModel.findById(classId);
  if (!cls) throw new NotFoundError('Class');
  if (String(cls.school) !== schoolId) throw new BadRequestError('Class does not belong to the selected organization');
  assertOwnsOrg(req, cls, 'school');
  return cls;
}

async function getTargetClass(schoolId: string, source: any, targetAcademicYear: string) {
  return ClassModel.findOne({
    school: schoolId,
    department: source.department,
    gradeLevel: source.gradeLevel + 1,
    academicYear: targetAcademicYear,
    status: { $ne: 'completed' },
  }).sort({ createdAt: 1 });
}

interface PromotionDecision {
  targetClass: mongoose.HydratedDocument<IClass> | null;
  targetCourseCount: number;
  willSkip: boolean;
  reason?: string;
}

// The SINGLE place that decides, for one non-graduating class, whether a
// promotion target exists and is ready. getPromotionPreview and promoteAll
// both call this — neither re-derives the skip condition independently — so
// "preview says ready" and "execution actually proceeds" can't drift apart
// again the way they did before (preview used to label a target with zero
// courses 'promote-new' while promoteAll skipped it outright).
async function resolvePromotionDecision(
  schoolId: string,
  cls: any,
  targetAcademicYear: string
): Promise<PromotionDecision> {
  const targetClass = await getTargetClass(schoolId, cls, targetAcademicYear);
  if (!targetClass) {
    return {
      targetClass: null,
      targetCourseCount: 0,
      willSkip: true,
      reason: `No Grade ${cls.gradeLevel + 1} target class exists for ${targetAcademicYear}.`,
    };
  }

  const targetCourseCount = await Course.countDocuments({
    school: schoolId,
    class: targetClass._id,
    status: { $in: ['draft', 'published'] },
  });

  if (targetCourseCount === 0) {
    return {
      targetClass,
      targetCourseCount: 0,
      willSkip: true,
      reason: 'Target class exists but has no courses. Create/link the target curriculum first; no student will be moved.',
    };
  }

  return { targetClass, targetCourseCount, willSkip: false };
}

export const getPromotionPreview = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = await getScopedSchoolId(req);
  const requestedTarget = String(req.query.targetAcademicYear || '').trim();
  const allowRepromote = req.query.allowRepromote === 'true' && process.env.NODE_ENV !== 'production';

  const schoolClasses = await ClassModel.find({ school: schoolId, status: { $in: ['active', 'completed'] } })
    .select('_id title section gradeLevel academicYear department isGraduatingGrade isEntryGrade promotedAt promotedTo status createdAt')
    .sort({ gradeLevel: 1, title: 1, section: 1 })
    .lean();

  const targetAcademicYear = requestedTarget || suggestedAcademicYear(schoolClasses.map((c) => c.academicYear || '').filter(Boolean));
  const groups: PromotionGroup[] = [];
  const missingGradeLevel: Array<{ classId: mongoose.Types.ObjectId; title: string; section?: string }> = [];
  const sameYearSkipped: Array<{ classId: mongoose.Types.ObjectId; title: string; section?: string }> = [];

  for (const cls of schoolClasses) {
    if (cls.gradeLevel === null || cls.gradeLevel === undefined) {
      if (cls.status === 'active' && !cls.promotedAt) {
        missingGradeLevel.push({ classId: cls._id, title: cls.title, section: cls.section });
      }
      continue;
    }

    if (cls.academicYear === targetAcademicYear && !allowRepromote) {
      sameYearSkipped.push({ classId: cls._id, title: cls.title, section: cls.section });
      continue;
    }

    if (cls.promotedAt && !allowRepromote) {
      groups.push({
        classId: cls._id,
        title: cls.title,
        section: cls.section,
        gradeLevel: cls.gradeLevel,
        studentCount: await Student.countDocuments({ class: cls._id, status: 'active' }),
        action: 'already-promoted',
        targetClassId: cls.promotedTo,
        sourceCourseCount: await Course.countDocuments({ school: schoolId, class: cls._id }),
      });
      continue;
    }

    if (cls.status !== 'active') continue;

    const studentCount = await Student.countDocuments({ class: cls._id, status: 'active' });
    const sourceCourseCount = await Course.countDocuments({ school: schoolId, class: cls._id });

    if (cls.isGraduatingGrade) {
      groups.push({
        classId: cls._id,
        title: cls.title,
        section: cls.section,
        gradeLevel: cls.gradeLevel,
        studentCount,
        action: 'graduate',
        sourceCourseCount,
      });
      continue;
    }

    const decision = await resolvePromotionDecision(schoolId, cls, targetAcademicYear);

    groups.push({
      classId: cls._id,
      title: cls.title,
      section: cls.section,
      gradeLevel: cls.gradeLevel,
      studentCount,
      action: decision.willSkip ? 'skipped' : 'promote-existing',
      targetClassId: decision.targetClass?._id as mongoose.Types.ObjectId | undefined,
      targetTitle: decision.targetClass?.title,
      targetCourseCount: decision.targetCourseCount,
      sourceCourseCount,
      opensNewIntake: false,
      reason: decision.reason,
    });
  }

  return ApiResponse.success(res, {
    targetAcademicYear,
    suggestedAcademicYear: targetAcademicYear,
    groups,
    missingGradeLevel,
    sameYearSkipped,
  });
};

export const promoteAll = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = await getScopedSchoolId(req);
  const targetAcademicYear = String(req.body?.targetAcademicYear || '').trim();
  if (!targetAcademicYear) throw new BadRequestError('Target academic year is required');

  const allowRepromote = req.body?.allowRepromote === true && process.env.NODE_ENV !== 'production';
  const classFilter: Record<string, unknown> = {
    school: schoolId,
    status: 'active',
    gradeLevel: { $ne: null },
  };
  if (!allowRepromote) {
    classFilter.promotedAt = null;
    classFilter.academicYear = { $ne: targetAcademicYear };
  }

  const classes = await ClassModel.find(classFilter).sort({ gradeLevel: 1, title: 1, section: 1 });
  const results: Record<string, unknown>[] = [];
  let studentsMoved = 0;
  let graduated = 0;
  let promoted = 0;
  let skipped = 0;
  let sameYearSkipped = 0;
  let intakesOpened = 0;

  for (const cls of classes) {
    if (cls.gradeLevel === null || cls.gradeLevel === undefined) {
      skipped += 1;
      results.push({ classId: cls._id, title: cls.title, action: 'skipped', reason: 'No grade level set' });
      continue;
    }

    if (!allowRepromote && cls.academicYear === targetAcademicYear) {
      sameYearSkipped += 1;
      results.push({ classId: cls._id, title: cls.title, action: 'skipped', reason: `Already belongs to ${targetAcademicYear}` });
      continue;
    }

    const students = await Student.find({ class: cls._id, status: 'active' }).select('_id enrolledCourses').lean();

    if (cls.isGraduatingGrade) {
      const { modifiedCount } = await Student.updateMany(
        { _id: { $in: students.map((s) => s._id) }, status: 'active' },
        { $set: { status: 'graduated' } },
      );
      cls.promotedAt = new Date();
      cls.status = 'completed';
      await cls.save();
      graduated += modifiedCount;
      results.push({ classId: cls._id, title: cls.title, action: 'graduated', studentsMoved: modifiedCount });
      continue;
    }

    const decision = await resolvePromotionDecision(schoolId, cls, targetAcademicYear);
    if (decision.willSkip) {
      skipped += 1;
      results.push({
        classId: cls._id,
        title: cls.title,
        action: 'skipped',
        targetClassId: decision.targetClass?._id,
        targetTitle: decision.targetClass?.title,
        reason: decision.reason,
        studentsMoved: 0,
      });
      continue;
    }
    const targetClass = decision.targetClass!;

    const targetCourses = await Course.find({
      school: schoolId,
      class: targetClass._id,
      status: { $in: ['draft', 'published'] },
    }).select('_id');

    const sourceCourses = await Course.find({ school: schoolId, class: cls._id }).select('_id');
    const sourceCourseIds = new Set(sourceCourses.map((c) => c._id.toString()));
    const targetCourseIds = targetCourses.map((c) => c._id.toString());

    for (const student of students) {
      const oldIds = (student.enrolledCourses || []).map((id) => id.toString());
      const nextIds = oldIds.filter((id) => !sourceCourseIds.has(id));
      for (const targetId of targetCourseIds) {
        if (!nextIds.includes(targetId)) nextIds.push(targetId);
      }

      await Student.updateOne(
        { _id: student._id, status: 'active' },
        {
          $set: {
            class: targetClass._id,
            shiftMode: targetClass.shiftMode,
            grade: targetClass.title,
            enrolledCourses: nextIds.map((id) => new mongoose.Types.ObjectId(id)),
          },
        },
      );
    }

    const affectedCourseIds = [...sourceCourses.map((c) => c._id), ...targetCourses.map((c) => c._id)];
    for (const courseId of affectedCourseIds) {
      const enrolledStudents = await Student.countDocuments({ enrolledCourses: courseId, status: 'active' });
      await Course.updateOne({ _id: courseId }, { $set: { enrolledStudents } });
    }

    cls.promotedAt = new Date();
    cls.promotedTo = targetClass._id as mongoose.Types.ObjectId;
    cls.status = 'completed';
    await cls.save();

    promoted += 1;
    studentsMoved += students.length;
    results.push({
      classId: cls._id,
      title: cls.title,
      action: 'promoted',
      targetClassId: targetClass._id,
      targetTitle: targetClass.title,
      targetCourseCount: targetCourses.length,
      sourceCourseCount: sourceCourses.length,
      studentsMoved: students.length,
    });
  }

  return ApiResponse.success(
    res,
    { results, promoted, graduated, skipped, sameYearSkipped, studentsMoved, intakesOpened },
    `Promoted ${promoted} classes, graduated ${graduated}, moved ${studentsMoved} students${skipped ? `, skipped ${skipped} class(es)` : ''}`,
  );
};

export const validatePromotionTarget = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = await getScopedSchoolId(req);
  const classId = String(req.query.classId || '').trim();
  if (!classId || !mongoose.isValidObjectId(classId)) throw new BadRequestError('A valid classId is required');

  const source = await assertClassInOrg(req, new mongoose.Types.ObjectId(classId), schoolId);
  const targetAcademicYear = String(req.query.targetAcademicYear || '').trim();
  if (!targetAcademicYear) throw new BadRequestError('targetAcademicYear is required');

  const target = await getTargetClass(schoolId, source, targetAcademicYear);
  const courses = target
    ? await Course.find({ school: schoolId, class: target._id, status: { $in: ['draft', 'published'] } }).select('_id title')
    : [];

  return ApiResponse.success(res, {
    sourceClassId: source._id,
    targetClassId: target?._id || null,
    targetClassTitle: target?.title || null,
    targetCourses: courses,
    ready: courses.length > 0,
  });
};
