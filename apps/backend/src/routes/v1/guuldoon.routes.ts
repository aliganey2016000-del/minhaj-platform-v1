import deviceRoutes, { promoteGuuldoonDeviceCookie, requireGuuldoonDevice } from './guuldoon-device.routes';
import { Router, Request } from 'express';
import mongoose from 'mongoose';
import Profile from '../../models/profile.model';
import Course from '../../models/course.model';
import Student from '../../models/student.model';
import ClassModel from '../../models/class.model';
import Teacher from '../../models/teacher.model';
import Progress from '../../models/progress.model';
import Subscription from '../../models/global-subscription.model';
import { authMiddleware } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/api-error';
import ApiResponse from '../../utils/api-response';

const router = Router();
router.use(authMiddleware);
router.use((req, _res, next) => {
  if (!['admin', 'org_admin', 'teacher', 'student'].includes(req.user?.role || '') || req.user?.isStaff) return next(new ForbiddenError('Guuldoon access denied'));
  if (req.user?.role !== 'admin' && !req.user?.organizationId) return next(new ForbiddenError('Organization required'));
  next();
});

router.use('/devices', deviceRoutes);

router.post('/courses/:courseId/open', asyncHandler(async (req, res) => {
  if (req.user?.role !== 'student' || req.user.isStaff) throw new ForbiddenError('Student access required');
  if (!mongoose.isValidObjectId(req.params.courseId)) throw new BadRequestError('Invalid course ID');

  const course = await Course.findOne({
    _id: req.params.courseId,
    scope: 'global',
    status: 'published',
  }).select('_id globalGrade scope status').lean();
  if (!course) throw new NotFoundError('Guuldoon course');

  const student = await Student.findOne({
    user: req.user.userId,
    school: req.user.organizationId,
    approvalStatus: 'approved',
    status: 'active',
  }).select('_id class enrolledCourses school').lean();
  if (!student?.class) throw new ForbiddenError('Your active school class is required for Guuldoon');

  const classroom = await ClassModel.findById(student.class).select('gradeLevel school').lean();
  const grade = classroom?.gradeLevel ?? null;
  if (![8, 12].includes(grade || 0) || grade !== course.globalGrade) {
    throw new ForbiddenError('This Guuldoon course is not available for your grade');
  }

  const now = new Date();
  const activeSubscription = await Subscription.exists({
    user: req.user.userId,
    school: student.school,
    grade,
    status: 'approved',
    startsAt: { $lte: now },
    expiresAt: { $gt: now },
  });
  if (!activeSubscription) throw new ForbiddenError('Active Guuldoon subscription required for this grade');

  await requireGuuldoonDevice(req);

  const enrolled = (student.enrolledCourses || []).some(id => String(id) === String(course._id));
  if (!enrolled) {
    const result = await Student.updateOne(
      { _id: student._id, enrolledCourses: { $ne: course._id } },
      { $addToSet: { enrolledCourses: course._id } },
    );
    if (result.modifiedCount > 0) {
      await Course.updateOne({ _id: course._id }, { $inc: { enrolledStudents: 1 } });
    }
  }

  // Existing users may still hold the old /api/v1/guuldoon-scoped cookie.
  // Promote it before navigating so /courses/:id/content can verify the same browser.
  promoteGuuldoonDeviceCookie(req, res);
  res.set('Cache-Control', 'no-store, private, max-age=0');
  return ApiResponse.success(res, { courseId: String(course._id), grade, access: 'granted' }, 'Guuldoon course access granted');
}));

/** All scope derives from authentication, never client school or student IDs. */
async function studentScope(req: Request): Promise<Record<string, unknown>> {
  if (req.user!.role === 'admin') return {};
  const filter: Record<string, unknown> = { school: req.user!.organizationId };
  if (req.user!.role === 'student') filter.user = req.user!.userId;
  if (req.user!.role === 'teacher') {
    const teacher = await Teacher.findOne({ user: req.user!.userId, school: req.user!.organizationId }).select('_id').lean();
    if (!teacher) return { _id: { $in: [] } };
    const courses = await Course.find({ teacher: teacher._id, school: req.user!.organizationId, scope: { $ne: 'global' } }).select('_id class').lean();
    filter.$or = [
      { class: { $in: courses.map(course => course.class).filter(Boolean) } },
      { enrolledCourses: { $in: courses.map(course => course._id) } },
    ];
  }
  return filter;
}

router.get('/overview', asyncHandler(async (req, res) => {
  if (!['admin', 'org_admin'].includes(req.user!.role)) throw new ForbiddenError('Administrator access required');
  const scope = req.user!.role === 'admin' ? {} : { school: new mongoose.Types.ObjectId(req.user!.organizationId) };
  const now = new Date();
  const [publishedCourses, activeUsers, pendingPayments, payments] = await Promise.all([
    Course.countDocuments({ scope: 'global', status: 'published' }),
    Subscription.distinct('user', { ...scope, status: 'approved', startsAt: { $lte: now }, expiresAt: { $gt: now } }),
    Subscription.countDocuments({ ...scope, status: 'pending' }),
    Subscription.aggregate([{ $match: { ...scope, verifiedReference: { $exists: true } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
  ]);
  return ApiResponse.success(res, { publishedCourses, activeSubscribers: activeUsers.length, pendingPayments, verifiedPaymentsUsd: payments[0]?.total || 0 });
}));
router.get('/performance', asyncHandler(async (req, res) => {
  const scopedStudents = await studentScope(req);
  if (scopedStudents.school) scopedStudents.school = new mongoose.Types.ObjectId(String(scopedStudents.school));
  if (scopedStudents.user) scopedStudents.user = new mongoose.Types.ObjectId(String(scopedStudents.user));
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  // Join and paginate in MongoDB rather than loading national student rosters into memory.
  const pipeline: mongoose.PipelineStage[] = [
    { $lookup: { from: Student.collection.name, localField: 'student', foreignField: '_id', pipeline: [{ $match: scopedStudents }, { $project: { studentId: 1, profile: 1 } }], as: 'student' } },
    { $unwind: '$student' },
    { $lookup: { from: Course.collection.name, localField: 'course', foreignField: '_id', pipeline: [{ $match: { scope: 'global', ...(req.user!.role === 'admin' ? {} : { status: 'published' }) } }, { $project: { title: 1, globalGrade: 1 } }], as: 'course' } },
    { $unwind: '$course' },
    { $sort: { lastAccessed: -1 } },
    { $facet: {
      rows: [
        { $skip: (page - 1) * 50 }, { $limit: 50 },
        { $lookup: { from: Profile.collection.name, localField: 'student.profile', foreignField: '_id', pipeline: [{ $project: { firstName: 1, lastName: 1 } }], as: 'profile' } },
        { $set: { 'student.profile': { $arrayElemAt: ['$profile', 0] } } },
        { $project: { student: 1, course: 1, completedLessons: 1, completedQuizzes: 1, completedAssignments: 1, totalItems: 1, status: 1, lastAccessed: 1 } },
      ],
      count: [{ $count: 'total' }],
    } },
  ];
  const [result] = await Progress.aggregate(pipeline);
  return ApiResponse.paginated(res, result?.rows || [], { page, limit: 50, total: result?.count[0]?.total || 0 });
}));
export default router;
