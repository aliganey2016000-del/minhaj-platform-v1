import { Request, Response } from 'express';
import mongoose from 'mongoose';
import ClassModel, { IClass } from '../models/class.model';
import Student from '../models/student.model';
import Course from '../models/course.model';
import CourseContent from '../models/course-content.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { assertOwnsOrg, resolveOrgIdForCreate } from '../utils/tenant-scope';
import { completeStudentEnrollmentHistory, reassignStudentClassCourses } from '../services/enrollment.service';

interface PromotionGroup {
  classId: mongoose.Types.ObjectId;
  title: string;
  section?: string;
  gradeLevel: number;
  studentCount: number;
  action: 'promote-new' | 'promote-existing' | 'graduate' | 'already-promoted' | 'skipped';
  targetClassId?: mongoose.Types.ObjectId;
  targetTitle?: string;
  targetGradeLevel?: number;
  targetCourseCount?: number;
  sourceCourseCount?: number;
  opensNewIntake?: boolean;
  willCreateTarget?: boolean;
  willCopyCurriculum?: boolean;
  reason?: string;
}

interface PromotionDecision {
  targetClass: mongoose.HydratedDocument<IClass> | null;
  templateClass: mongoose.HydratedDocument<IClass> | null;
  targetCourseCount: number;
  willCreateTarget: boolean;
  willCopyCurriculum: boolean;
  willSkip: boolean;
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

function previousAcademicYear(targetAcademicYear: string): string | null {
  const start = academicYearStart(targetAcademicYear);
  return start === null ? null : `${start - 1}-${start}`;
}

function gradeBounds(classes: Array<{ gradeLevel?: number | null }>) {
  const grades = classes
    .map((c) => c.gradeLevel)
    .filter((g): g is number => typeof g === 'number' && Number.isFinite(g));
  return {
    min: grades.length ? Math.min(...grades) : null,
    max: grades.length ? Math.max(...grades) : null,
  };
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
  const query: Record<string, unknown> = {
    school: schoolId,
    department: source.department,
    gradeLevel: source.gradeLevel + 1,
    academicYear: targetAcademicYear,
    status: { $ne: 'completed' },
  };
  if (String(source.batch || '').trim()) query.batch = String(source.batch).trim();
  if (String(source.section || '').trim()) query.section = String(source.section).trim();
  return ClassModel.findOne(query).sort({ createdAt: 1 });
}

async function getGradeTemplate(schoolId: string, source: any, targetGradeLevel: number) {
  const candidates = await ClassModel.find({
    school: schoolId,
    department: source.department,
    gradeLevel: targetGradeLevel,
    academicYear: source.academicYear,
    status: 'active',
  }).sort({ createdAt: 1 });

  if (!candidates.length) return null;
  const sourceSection = String(source.section || '').trim().toLowerCase();
  if (sourceSection) {
    const exact = candidates.find((c) => String(c.section || '').trim().toLowerCase() === sourceSection);
    if (exact) return exact;
  }
  return candidates[0];
}

async function publishedCourseCount(schoolId: string, classId: mongoose.Types.ObjectId) {
  return Course.countDocuments({ school: schoolId, class: classId, status: 'published' });
}

async function resolvePromotionDecision(
  schoolId: string,
  cls: any,
  targetAcademicYear: string
): Promise<PromotionDecision> {
  const targetClass = await getTargetClass(schoolId, cls, targetAcademicYear);
  if (targetClass) {
    const targetCourseCount = await publishedCourseCount(schoolId, targetClass._id as mongoose.Types.ObjectId);
    if (targetCourseCount > 0) {
      return {
        targetClass,
        templateClass: null,
        targetCourseCount,
        willCreateTarget: false,
        willCopyCurriculum: false,
        willSkip: false,
      };
    }
  }

  const targetGradeLevel = Number(cls.gradeLevel) + 1;
  const templateClass = await getGradeTemplate(schoolId, cls, targetGradeLevel);
  if (!templateClass) {
    return {
      targetClass,
      templateClass: null,
      targetCourseCount: 0,
      willCreateTarget: !targetClass,
      willCopyCurriculum: false,
      willSkip: true,
      reason: `No Grade ${targetGradeLevel} class exists in ${cls.academicYear} to use as the curriculum template.`,
    };
  }

  const templateCourseCount = await publishedCourseCount(schoolId, templateClass._id as mongoose.Types.ObjectId);
  if (templateCourseCount === 0) {
    return {
      targetClass,
      templateClass,
      targetCourseCount: 0,
      willCreateTarget: !targetClass,
      willCopyCurriculum: false,
      willSkip: true,
      reason: `Grade ${targetGradeLevel} exists, but it has no published courses to copy into ${targetAcademicYear}.`,
    };
  }

  return {
    targetClass,
    templateClass,
    targetCourseCount: templateCourseCount,
    willCreateTarget: !targetClass,
    willCopyCurriculum: true,
    willSkip: false,
    reason: targetClass
      ? `The ${targetAcademicYear} class exists; its Grade ${targetGradeLevel} curriculum will be prepared automatically.`
      : `Grade ${targetGradeLevel} and its curriculum will be prepared automatically for ${targetAcademicYear}.`,
  };
}

function cloneableCourse(sourceCourse: any, targetClassId: mongoose.Types.ObjectId, schoolId: string) {
  const raw = sourceCourse.toObject() as Record<string, any>;
  delete raw._id;
  delete raw.__v;
  delete raw.createdAt;
  delete raw.updatedAt;
  raw.school = new mongoose.Types.ObjectId(schoolId);
  raw.class = targetClassId;
  raw.slug = `${String(sourceCourse.slug || 'course')}-${targetClassId.toString().slice(-6)}-${new mongoose.Types.ObjectId().toString().slice(-6)}`;
  raw.enrolledStudents = 0;
  raw.isLive = false;
  raw.meetingLink = '';
  raw.startDate = null;
  raw.endDate = null;
  return raw;
}

async function clonePublishedCurriculum(
  schoolId: string,
  templateClassId: mongoose.Types.ObjectId,
  targetClassId: mongoose.Types.ObjectId,
): Promise<number> {
  const sourceCourses = await Course.find({ school: schoolId, class: templateClassId, status: 'published' });
  let copied = 0;

  for (const sourceCourse of sourceCourses) {
    const createdCourse = await Course.create(cloneableCourse(sourceCourse, targetClassId, schoolId));
    const content = await CourseContent.findOne({ course: sourceCourse._id }).lean() as Record<string, any> | null;
    if (content) {
      const clonedContent = { ...content, course: createdCourse._id } as Record<string, any>;
      delete clonedContent._id;
      delete clonedContent.__v;
      delete clonedContent.createdAt;
      delete clonedContent.updatedAt;
      await CourseContent.create(clonedContent);
    }
    copied += 1;
  }

  return copied;
}

async function ensurePromotionTarget(
  schoolId: string,
  source: mongoose.HydratedDocument<IClass>,
  targetAcademicYear: string,
): Promise<{ targetClass: mongoose.HydratedDocument<IClass>; targetCreated: boolean; coursesCopied: number }> {
  let targetClass = await getTargetClass(schoolId, source, targetAcademicYear);
  const targetGradeLevel = Number(source.gradeLevel) + 1;
  const templateClass = await getGradeTemplate(schoolId, source, targetGradeLevel);
  let targetCreated = false;

  if (!targetClass) {
    if (!templateClass) throw new BadRequestError(`No Grade ${targetGradeLevel} template is available.`);
    targetClass = await ClassModel.create({
      school: source.school,
      department: source.department,
      title: templateClass.title || `Grade ${targetGradeLevel}`,
      section: source.section || templateClass.section || '',
      room: templateClass.room || source.room,
      capacity: templateClass.capacity ?? source.capacity ?? null,
      shiftMode: templateClass.shiftMode || source.shiftMode || 'Morning',
      status: 'active',
      batch: source.batch || '',
      gradeLevel: targetGradeLevel,
      academicYear: targetAcademicYear,
      isGraduatingGrade: !!templateClass.isGraduatingGrade,
      isEntryGrade: false,
      promotedAt: null,
      promotedTo: null,
    });
    targetCreated = true;
  }

  let coursesCopied = 0;
  const existingPublished = await publishedCourseCount(schoolId, targetClass._id as mongoose.Types.ObjectId);
  if (existingPublished === 0) {
    if (!templateClass) throw new BadRequestError(`No Grade ${targetGradeLevel} curriculum template is available.`);
    coursesCopied = await clonePublishedCurriculum(
      schoolId,
      templateClass._id as mongoose.Types.ObjectId,
      targetClass._id as mongoose.Types.ObjectId,
    );
    if (coursesCopied === 0) throw new BadRequestError(`Grade ${targetGradeLevel} has no published courses to promote students into.`);
  }

  return { targetClass, targetCreated, coursesCopied };
}

async function ensureEntryIntake(
  schoolId: string,
  source: mongoose.HydratedDocument<IClass>,
  targetAcademicYear: string,
): Promise<{ created: boolean; coursesCopied: number }> {
  const query: Record<string, unknown> = {
    school: schoolId,
    department: source.department,
    gradeLevel: source.gradeLevel,
    academicYear: targetAcademicYear,
    status: { $ne: 'completed' },
  };
  if (String(source.section || '').trim()) query.section = String(source.section).trim();

  let intake = await ClassModel.findOne(query).sort({ createdAt: 1 });
  let created = false;
  if (!intake) {
    const targetStart = academicYearStart(targetAcademicYear);
    intake = await ClassModel.create({
      school: source.school,
      department: source.department,
      title: source.title,
      section: source.section || '',
      room: source.room,
      capacity: source.capacity ?? null,
      shiftMode: source.shiftMode || 'Morning',
      status: 'active',
      batch: targetStart === null ? targetAcademicYear : String(targetStart),
      gradeLevel: source.gradeLevel,
      academicYear: targetAcademicYear,
      isGraduatingGrade: !!source.isGraduatingGrade,
      isEntryGrade: true,
      promotedAt: null,
      promotedTo: null,
    });
    created = true;
  } else if (!intake.isEntryGrade) {
    intake.isEntryGrade = true;
    await intake.save();
  }

  let coursesCopied = 0;
  const existingPublished = await publishedCourseCount(schoolId, intake._id as mongoose.Types.ObjectId);
  if (existingPublished === 0) {
    coursesCopied = await clonePublishedCurriculum(
      schoolId,
      source._id as mongoose.Types.ObjectId,
      intake._id as mongoose.Types.ObjectId,
    );
  }
  return { created, coursesCopied };
}

export const getPromotionPreview = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = await getScopedSchoolId(req);
  const allActiveYears = await ClassModel.find({ school: schoolId, status: 'active' }).select('academicYear').lean();
  const requestedTarget = String(req.query.targetAcademicYear || '').trim();
  const targetAcademicYear = requestedTarget || suggestedAcademicYear(allActiveYears.map((c) => c.academicYear || '').filter(Boolean));
  const sourceAcademicYear = previousAcademicYear(targetAcademicYear);
  if (!sourceAcademicYear) throw new BadRequestError('Academic year must use the format YYYY-YYYY, for example 2027-2028.');

  const allowRepromote = req.query.allowRepromote === 'true' && process.env.NODE_ENV !== 'production';
  const schoolClasses = await ClassModel.find({
    school: schoolId,
    academicYear: sourceAcademicYear,
    status: { $in: ['active', 'completed'] },
  })
    .select('_id title section batch gradeLevel academicYear department room capacity shiftMode isGraduatingGrade isEntryGrade promotedAt promotedTo status createdAt updatedAt')
    .sort({ gradeLevel: 1, title: 1, section: 1 });

  const activeSourceClasses = schoolClasses.filter((c) => c.status === 'active');
  const bounds = gradeBounds(activeSourceClasses);
  const hasExplicitEntry = activeSourceClasses.some((c) => !!c.isEntryGrade);
  const hasExplicitFinal = activeSourceClasses.some((c) => !!c.isGraduatingGrade);
  const isEntryClass = (cls: any) => !!cls.isEntryGrade || (!hasExplicitEntry && bounds.min !== null && cls.gradeLevel === bounds.min);
  const isFinalClass = (cls: any) => !!cls.isGraduatingGrade || (!hasExplicitFinal && bounds.max !== null && cls.gradeLevel === bounds.max);

  const groups: PromotionGroup[] = [];
  const missingGradeLevel: Array<{ classId: mongoose.Types.ObjectId; title: string; section?: string }> = [];
  const sameYearSkipped: Array<{ classId: mongoose.Types.ObjectId; title: string; section?: string }> = [];
  let entryIntakesToOpen = 0;

  for (const cls of schoolClasses) {
    if (cls.gradeLevel === null || cls.gradeLevel === undefined) {
      if (cls.status === 'active' && !cls.promotedAt) missingGradeLevel.push({ classId: cls._id, title: cls.title, section: cls.section });
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
    if (isEntryClass(cls)) entryIntakesToOpen += 1;

    const studentCount = await Student.countDocuments({ class: cls._id, status: 'active' });
    const sourceCourseCount = await Course.countDocuments({ school: schoolId, class: cls._id });

    if (isFinalClass(cls)) {
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
      action: decision.willSkip ? 'skipped' : decision.willCreateTarget ? 'promote-new' : 'promote-existing',
      targetClassId: decision.targetClass?._id as mongoose.Types.ObjectId | undefined,
      targetTitle: decision.targetClass?.title || decision.templateClass?.title || `Grade ${Number(cls.gradeLevel) + 1}`,
      targetGradeLevel: Number(cls.gradeLevel) + 1,
      targetCourseCount: decision.targetCourseCount,
      sourceCourseCount,
      opensNewIntake: false,
      willCreateTarget: decision.willCreateTarget,
      willCopyCurriculum: decision.willCopyCurriculum,
      reason: decision.reason,
    });
  }

  return ApiResponse.success(res, {
    sourceAcademicYear,
    targetAcademicYear,
    suggestedAcademicYear: targetAcademicYear,
    groups,
    entryIntakesToOpen,
    missingGradeLevel,
    sameYearSkipped,
    inferredEntryGrade: !hasExplicitEntry ? bounds.min : null,
    inferredFinalGrade: !hasExplicitFinal ? bounds.max : null,
  });
};

export const promoteAll = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = await getScopedSchoolId(req);
  const targetAcademicYear = String(req.body?.targetAcademicYear || '').trim();
  if (!targetAcademicYear) throw new BadRequestError('Target academic year is required');
  const sourceAcademicYear = previousAcademicYear(targetAcademicYear);
  if (!sourceAcademicYear) throw new BadRequestError('Academic year must use the format YYYY-YYYY, for example 2027-2028.');

  const allowRepromote = req.body?.allowRepromote === true && process.env.NODE_ENV !== 'production';
  const classFilter: Record<string, unknown> = {
    school: schoolId,
    status: 'active',
    gradeLevel: { $ne: null },
    academicYear: sourceAcademicYear,
  };
  if (!allowRepromote) classFilter.promotedAt = null;

  const classes = await ClassModel.find(classFilter).sort({ gradeLevel: 1, title: 1, section: 1 });
  const bounds = gradeBounds(classes);
  const hasExplicitEntry = classes.some((c) => !!c.isEntryGrade);
  const hasExplicitFinal = classes.some((c) => !!c.isGraduatingGrade);
  const isEntryClass = (cls: any) => !!cls.isEntryGrade || (!hasExplicitEntry && bounds.min !== null && cls.gradeLevel === bounds.min);
  const isFinalClass = (cls: any) => !!cls.isGraduatingGrade || (!hasExplicitFinal && bounds.max !== null && cls.gradeLevel === bounds.max);
  const entryClasses = classes.filter((c) => isEntryClass(c));

  const results: Record<string, unknown>[] = [];
  let studentsMoved = 0;
  let graduated = 0;
  let promoted = 0;
  let skipped = 0;
  let sameYearSkipped = 0;
  let intakesOpened = 0;
  let targetsCreated = 0;
  let coursesCopied = 0;

  if (!classes.length) {
    const ownActiveClasses = await ClassModel.find({
      school: schoolId,
      status: 'active',
      gradeLevel: { $ne: null },
    }).select('_id title academicYear').sort({ gradeLevel: 1, title: 1 });
    for (const cls of ownActiveClasses) {
      skipped += 1;
      results.push({
        classId: cls._id,
        title: cls.title,
        action: 'skipped',
        reason: `Not part of source academic year ${sourceAcademicYear}; no data was changed.`,
        studentsMoved: 0,
      });
    }
  }

  for (const cls of classes) {
    if (cls.gradeLevel === null || cls.gradeLevel === undefined) {
      skipped += 1;
      results.push({ classId: cls._id, title: cls.title, action: 'skipped', reason: 'No grade level set' });
      continue;
    }

    const students = await Student.find({ class: cls._id, status: 'active' }).select('_id').lean();

    if (isFinalClass(cls)) {
      let modifiedCount = 0;
      for (const student of students) {
        const result = await Student.updateOne(
          { _id: student._id, status: 'active' },
          { $set: { status: 'graduated' } },
        );
        modifiedCount += result.modifiedCount;
        await completeStudentEnrollmentHistory(student._id, 'graduated');
      }
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
        targetTitle: decision.targetClass?.title || decision.templateClass?.title,
        reason: decision.reason,
        studentsMoved: 0,
      });
      continue;
    }

    const targetInfo = await ensurePromotionTarget(schoolId, cls, targetAcademicYear);
    const targetClass = targetInfo.targetClass;
    if (targetInfo.targetCreated) targetsCreated += 1;
    coursesCopied += targetInfo.coursesCopied;

    const targetCourses = await Course.find({
      school: schoolId,
      class: targetClass._id,
      status: 'published',
    }).select('_id');
    const sourceCourses = await Course.find({ school: schoolId, class: cls._id }).select('_id');

    for (const student of students) {
      await reassignStudentClassCourses(student._id, cls._id, targetClass._id);
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
      targetCreated: targetInfo.targetCreated,
      coursesCopied: targetInfo.coursesCopied,
    });
  }

  for (const entryClass of entryClasses) {
    const intake = await ensureEntryIntake(schoolId, entryClass, targetAcademicYear);
    if (intake.created) intakesOpened += 1;
    coursesCopied += intake.coursesCopied;
  }

  return ApiResponse.success(
    res,
    {
      sourceAcademicYear,
      targetAcademicYear,
      results,
      promoted,
      graduated,
      skipped,
      sameYearSkipped,
      studentsMoved,
      intakesOpened,
      targetsCreated,
      coursesCopied,
      inferredEntryGrade: !hasExplicitEntry ? bounds.min : null,
      inferredFinalGrade: !hasExplicitFinal ? bounds.max : null,
    },
    `Year-end promotion complete: moved ${studentsMoved} student(s), graduated ${graduated}, prepared ${targetsCreated} class(es) and opened ${intakesOpened} intake class(es)${skipped ? `; skipped ${skipped} class(es)` : ''}.`,
  );
};

export const validatePromotionTarget = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = await getScopedSchoolId(req);
  const classId = String(req.query.classId || '').trim();
  if (!classId || !mongoose.isValidObjectId(classId)) throw new BadRequestError('A valid classId is required');

  const source = await assertClassInOrg(req, new mongoose.Types.ObjectId(classId), schoolId);
  const targetAcademicYear = String(req.query.targetAcademicYear || '').trim();
  if (!targetAcademicYear) throw new BadRequestError('targetAcademicYear is required');

  const decision = await resolvePromotionDecision(schoolId, source, targetAcademicYear);
  const courses = decision.targetClass
    ? await Course.find({ school: schoolId, class: decision.targetClass._id, status: 'published' }).select('_id title')
    : [];

  return ApiResponse.success(res, {
    sourceClassId: source._id,
    targetClassId: decision.targetClass?._id || null,
    targetClassTitle: decision.targetClass?.title || decision.templateClass?.title || null,
    targetCourses: courses,
    ready: !decision.willSkip,
    willCreateTarget: decision.willCreateTarget,
    willCopyCurriculum: decision.willCopyCurriculum,
    reason: decision.reason,
  });
};
