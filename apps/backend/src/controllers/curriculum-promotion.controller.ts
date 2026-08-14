import { Request, Response } from 'express';
import mongoose from 'mongoose';
import ClassModel from '../models/class.model';
import Department from '../models/department.model';
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
  action: 'promote-existing' | 'blocked-no-target-courses' | 'graduate' | 'skipped';
  targetClassId?: mongoose.Types.ObjectId;
  targetTitle?: string;
  targetCourseCount?: number;
  sourceCourseCount?: number;
}

function bumpTitleGrade(title: string, nextGradeLevel: number): string {
  const replaced = title.replace(/\b(grade|class)\s*\d+\b/i, (match) => {
    const prefix = /^grade/i.test(match.trim()) ? 'Grade' : 'Class';
    return `${prefix} ${nextGradeLevel}`;
  });
  return replaced === title ? `Grade ${nextGradeLevel}` : replaced;
}

async function getScopedSchoolId(req: Request): Promise<string> {
  const resolved = resolveOrgIdForCreate(req, req.body.schoolId);
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

/**
 * Preview the curriculum-aware promotion. Unlike the legacy implementation,
 * this endpoint treats the target class's existing courses as the source of
 * truth for the student's next curriculum and never creates CourseContent.
 */
export const getPromotionPreview = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = await getScopedSchoolId(req);
  const targetAcademicYear = String(req.query.targetAcademicYear || '').trim();
  if (!targetAcademicYear) throw new BadRequestError('Target academic year is required');

  const classes = await ClassModel.find({
    school: schoolId,
    status: 'active',
    gradeLevel: { $ne: null },
    promotedAt: null,
    academicYear: { $ne: targetAcademicYear },
  }).sort({ gradeLevel: 1, title: 1 });

  const groups: PromotionGroup[] = [];
  const missingGradeLevel: Array<{ classId: mongoose.Types.ObjectId; title: string }> = [];

  for (const cls of classes) {
    const studentCount = await Student.countDocuments({ class: cls._id, status: 'active' });
    if (cls.gradeLevel === null || cls.gradeLevel === undefined) {
      missingGradeLevel.push({ classId: cls._id, title: cls.title });
      continue;
    }

    if (cls.isGraduatingGrade) {
      groups.push({
        classId: cls._id,
        title: cls.title,
        section: cls.section,
        gradeLevel: cls.gradeLevel,
        studentCount,
        action: 'graduate',
        sourceCourseCount: await Course.countDocuments({ school: schoolId, class: cls._id }),
      });
      continue;
    }

    const targetClass = await ClassModel.findOne({
      school: schoolId,
      department: cls.department,
      gradeLevel: cls.gradeLevel + 1,
      academicYear: targetAcademicYear,
      status: { $ne: 'completed' },
    }).select('_id title');

    const targetCourseCount = targetClass
      ? await Course.countDocuments({ school: schoolId, class: targetClass._id, status: { $in: ['draft', 'published'] } })
      : 0;

    groups.push({
      classId: cls._id,
      title: cls.title,
      section: cls.section,
      gradeLevel: cls.gradeLevel,
      studentCount,
      action: targetCourseCount > 0 ? 'promote-existing' : 'blocked-no-target-courses',
      targetClassId: targetClass?._id,
      targetTitle: targetClass?.title,
      targetCourseCount,
      sourceCourseCount: await Course.countDocuments({ school: schoolId, class: cls._id }),
    });
  }

  return ApiResponse.success(res, { targetAcademicYear, groups, missingGradeLevel });
};

/**
 * Promote students while keeping curriculum/content immutable.
 *
 * Source of truth:
 *   Class -> Courses -> CourseContent
 *
 * The student's `enrolledCourses` is current enrollment only. Promotion
 * removes courses belonging to the old class and adds the already-existing
 * courses belonging to the target class. Progress documents are deliberately
 * untouched, so Grade 1 history remains available forever.
 */
export const promoteAll = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = await getScopedSchoolId(req);
  const targetAcademicYear = String(req.body.targetAcademicYear || '').trim();
  if (!targetAcademicYear) throw new BadRequestError('Target academic year is required');

  const allowRepromote = req.body.allowRepromote === true;
  const classFilter: Record<string, unknown> = {
    school: schoolId,
    status: 'active',
    gradeLevel: { $ne: null },
  };
  if (!allowRepromote) {
    classFilter.promotedAt = null;
    classFilter.academicYear = { $ne: targetAcademicYear };
  }

  const classes = await ClassModel.find(classFilter).sort({ gradeLevel: 1, title: 1 });
  const results: Record<string, unknown>[] = [];
  let studentsMoved = 0;
  let graduated = 0;
  let promoted = 0;
  let blocked = 0;

  for (const cls of classes) {
    if (cls.gradeLevel === null || cls.gradeLevel === undefined) {
      results.push({ classId: cls._id, title: cls.title, action: 'skipped', reason: 'No grade level set' });
      continue;
    }

    const students = await Student.find({ class: cls._id, status: 'active' }).select('_id enrolledCourses').lean();

    if (cls.isGraduatingGrade) {
      const { modifiedCount } = await Student.updateMany(
        { _id: { $in: students.map((s) => s._id) }, status: 'active' },
        { $set: { status: 'graduated' } }
      );
      cls.promotedAt = new Date();
      cls.status = 'completed';
      await cls.save();
      graduated += modifiedCount;
      results.push({ classId: cls._id, title: cls.title, action: 'graduated', studentsMoved: modifiedCount });
      continue;
    }

    const targetClass = await ClassModel.findOne({
      school: schoolId,
      department: cls.department,
      gradeLevel: cls.gradeLevel + 1,
      academicYear: targetAcademicYear,
      status: { $ne: 'completed' },
    });

    if (!targetClass) {
      blocked += 1;
      results.push({
        classId: cls._id,
        title: cls.title,
        action: 'blocked-no-target-courses',
        reason: `No target Grade ${cls.gradeLevel + 1} class exists for ${targetAcademicYear}`,
        studentsMoved: 0,
      });
      continue;
    }

    const targetCourses = await Course.find({
      school: schoolId,
      class: targetClass._id,
      status: { $in: ['draft', 'published'] },
    }).select('_id');

    if (targetCourses.length === 0) {
      blocked += 1;
      results.push({
        classId: cls._id,
        title: cls.title,
        action: 'blocked-no-target-courses',
        targetClassId: targetClass._id,
        targetTitle: targetClass.title,
        reason: 'Target class has no courses yet. Create/link the Grade curriculum first; no student was moved.',
        studentsMoved: 0,
      });
      continue;
    }

    const sourceCourses = await Course.find({ school: schoolId, class: cls._id }).select('_id');
    const sourceCourseIds = sourceCourses.map((c) => c._id);
    const targetCourseIds = targetCourses.map((c) => c._id);

    // Update each student independently so $addToSet cannot duplicate a
    // course and old-course removal is deterministic. We intentionally do
    // NOT touch Progress: its {student, course} record is the historical
    // learning journey for that course.
    for (const student of students) {
      const oldIds = (student.enrolledCourses || []).map((id) => id.toString());
      const sourceIdSet = new Set(sourceCourseIds.map((id) => id.toString()));
      const targetIdSet = new Set(targetCourseIds.map((id) => id.toString()));
      const nextIds = oldIds.filter((id) => !sourceIdSet.has(id));
      for (const targetId of targetIdSet) {
        if (!nextIds.includes(targetId)) nextIds.push(targetId);
      }

      await Student.updateOne(
        { _id: student._id },
        {
          $set: {
            class: targetClass._id,
            shiftMode: targetClass.shiftMode,
            grade: targetClass.title,
            department: await Department.findById(targetClass.department).then((d) => d?.name),
            enrolledCourses: nextIds.map((id) => new mongoose.Types.ObjectId(id)),
          },
        }
      );
    }

    // Keep denormalized course counters accurate without manufacturing a
    // new Course or CourseContent document. Counts are derived from actual
    // Student enrollment after the move.
    const affectedCourseIds = [...sourceCourseIds, ...targetCourseIds];
    for (const courseId of affectedCourseIds) {
      const enrolledStudents = await Student.countDocuments({ enrolledCourses: courseId });
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
    { results, promoted, graduated, blocked, studentsMoved },
    `Promoted ${promoted} classes, graduated ${graduated}, moved ${studentsMoved} students${blocked ? `, blocked ${blocked} class(es) awaiting target curriculum` : ''}`
  );
};

export const validatePromotionTarget = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = await getScopedSchoolId(req);
  const classId = req.query.classId as string | undefined;
  if (!classId) throw new BadRequestError('classId is required');

  const source = await assertClassInOrg(req, new mongoose.Types.ObjectId(classId), schoolId);
  const targetAcademicYear = String(req.query.targetAcademicYear || '').trim();
  if (!targetAcademicYear) throw new BadRequestError('targetAcademicYear is required');

  const target = await ClassModel.findOne({
    school: schoolId,
    department: source.department,
    gradeLevel: (source.gradeLevel ?? -1) + 1,
    academicYear: targetAcademicYear,
    status: { $ne: 'completed' },
  });

  const courses = target ? await Course.find({ school: schoolId, class: target._id, status: { $in: ['draft', 'published'] } }).select('_id title') : [];
  return ApiResponse.success(res, {
    sourceClassId: source._id,
    targetClassId: target?._id || null,
    targetClassTitle: target?.title || null,
    targetCourses: courses,
    ready: courses.length > 0,
  });
};
