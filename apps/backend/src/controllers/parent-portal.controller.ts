import { Request, Response } from 'express';
import Parent from '../models/parent.model';
import Attendance from '../models/attendance.model';
import Result from '../models/result.model';
import Exam from '../models/exam.model';
import Event from '../models/event.model';
import Notification from '../models/notification.model';
import Course from '../models/course.model';
import Profile from '../models/profile.model';
import User from '../models/user.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';

async function requireParent(req: Request) {
  const parent = await Parent.findOne({ user: req.user!.userId })
    .populate('profile')
    .populate('user', 'email phone preferredLanguage')
    .populate('school', 'name')
    .lean();
  if (!parent) throw new NotFoundError('Parent record for this account');
  return parent as any;
}

async function requireOwnedChild(req: Request, childId: string) {
  const parent = await Parent.findOne({ user: req.user!.userId }).select('children').lean();
  if (!parent) throw new NotFoundError('Parent record for this account');
  const owns = (parent.children || []).some((id: any) => String(id) === String(childId));
  if (!owns) throw new NotFoundError('Child linked to this parent');
}

async function getVisibleEventCreatorIds(schoolId?: unknown) {
  const clauses: Record<string, unknown>[] = [{ role: 'admin' }];
  if (schoolId) clauses.push({ organizationId: schoolId });
  return User.find({ $or: clauses, isActive: true }).distinct('_id');
}

async function getPublishedExamIds() {
  return Exam.find({ resultsPublished: true, status: { $ne: 'cancelled' } }).distinct('_id');
}

export const getOverview = async (req: Request, res: Response): Promise<Response> => {
  const parent = await Parent.findOne({ user: req.user!.userId })
    .populate({
      path: 'children',
      select: 'studentId status attendancePercentage gpa totalFeesPaid totalFeesDue profile enrolledCourses',
      populate: [
        { path: 'profile', select: 'firstName lastName avatar' },
        { path: 'enrolledCourses', select: 'title courseCode teacher' },
      ],
    })
    .populate('profile', 'firstName lastName avatar')
    .populate('school', 'name')
    .lean();
  if (!parent) throw new NotFoundError('Parent record for this account');

  const childIds = (parent.children || []).map((c: any) => c._id);
  const schoolId = (parent as any).school?._id ?? (parent as any).school;
  const [publishedExamIds, eventCreatorIds] = await Promise.all([
    getPublishedExamIds(),
    getVisibleEventCreatorIds(schoolId),
  ]);

  const [recentAttendance, recentResults, unreadNotifications, upcomingEvents] = await Promise.all([
    childIds.length ? Attendance.find({ student: { $in: childIds } })
      .populate('course', 'title courseCode')
      .populate({ path: 'student', select: 'studentId profile', populate: { path: 'profile', select: 'firstName lastName' } })
      .sort({ date: -1 }).limit(8).lean() : [],
    childIds.length && publishedExamIds.length ? Result.find({ student: { $in: childIds }, exam: { $in: publishedExamIds } })
      .populate({ path: 'exam', select: 'title course examDate', populate: { path: 'course', select: 'title courseCode' } })
      .populate({ path: 'student', select: 'studentId profile', populate: { path: 'profile', select: 'firstName lastName' } })
      .sort({ createdAt: -1 }).limit(8).lean() : [],
    Notification.countDocuments({ user: req.user!.userId, read: false }),
    eventCreatorIds.length ? Event.find({
      createdBy: { $in: eventCreatorIds },
      eventDate: { $gte: new Date() },
      status: { $in: ['upcoming', 'ongoing'] },
    }).sort({ eventDate: 1 }).limit(5).lean() : [],
  ]);

  const totals = (parent.children || []).reduce((acc: any, child: any) => {
    acc.due += Number(child.totalFeesDue || 0);
    acc.paid += Number(child.totalFeesPaid || 0);
    return acc;
  }, { due: 0, paid: 0 });

  return ApiResponse.success(res, {
    parent: {
      parentId: parent.parentId,
      name: `${(parent as any).profile?.firstName || ''} ${(parent as any).profile?.lastName || ''}`.trim(),
      school: (parent as any).school?.name || '',
    },
    children: parent.children || [], totals, unreadNotifications,
    recentAttendance, recentResults, upcomingEvents,
  });
};

export const getChildAttendance = async (req: Request, res: Response): Promise<Response> => {
  await requireOwnedChild(req, req.params.childId);
  const records = await Attendance.find({ student: req.params.childId })
    .populate('course', 'title courseCode')
    .sort({ date: -1 }).limit(200).lean();
  const summary = records.reduce((acc: Record<string, number>, row: any) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    acc.total = (acc.total || 0) + 1;
    return acc;
  }, { total: 0, present: 0, absent: 0, late: 0, excused: 0 });
  return ApiResponse.success(res, { summary, records });
};

export const getChildResults = async (req: Request, res: Response): Promise<Response> => {
  await requireOwnedChild(req, req.params.childId);
  const publishedExamIds = await getPublishedExamIds();
  if (!publishedExamIds.length) return ApiResponse.success(res, []);
  const results = await Result.find({ student: req.params.childId, exam: { $in: publishedExamIds } })
    .populate({ path: 'exam', select: 'title course examDate totalMarks resultsPublished', populate: { path: 'course', select: 'title courseCode' } })
    .sort({ createdAt: -1 }).limit(200).lean();
  return ApiResponse.success(res, results);
};

export const getTeachers = async (req: Request, res: Response): Promise<Response> => {
  const parent = await Parent.findOne({ user: req.user!.userId })
    .populate({ path: 'children', select: 'studentId profile enrolledCourses', populate: { path: 'profile', select: 'firstName lastName' } })
    .lean();
  if (!parent) throw new NotFoundError('Parent record for this account');
  const children = parent.children || [];
  const courseIds = [...new Set(children.flatMap((c: any) => (c.enrolledCourses || []).map((id: any) => String(id))))];
  const courses = courseIds.length ? await Course.find({ _id: { $in: courseIds } })
    .select('title courseCode teacher')
    .populate({ path: 'teacher', select: 'teacherId qualification specialization profile user', populate: [
      { path: 'profile', select: 'firstName lastName avatar' },
      { path: 'user', select: 'email phone' },
    ] }).lean() : [];
  return ApiResponse.success(res, courses);
};

export const getEvents = async (req: Request, res: Response): Promise<Response> => {
  const parent = await requireParent(req);
  const schoolId = parent.school?._id ?? parent.school;
  const eventCreatorIds = await getVisibleEventCreatorIds(schoolId);
  const events = eventCreatorIds.length ? await Event.find({
    createdBy: { $in: eventCreatorIds },
    status: { $ne: 'cancelled' },
  }).sort({ eventDate: 1 }).limit(100).lean() : [];
  return ApiResponse.success(res, events);
};

export const getNotifications = async (req: Request, res: Response): Promise<Response> => {
  const notifications = await Notification.find({ user: req.user!.userId }).sort({ createdAt: -1 }).limit(100).lean();
  return ApiResponse.success(res, notifications);
};

export const markNotificationRead = async (req: Request, res: Response): Promise<Response> => {
  const notification = await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user!.userId }, { read: true }, { new: true });
  if (!notification) throw new NotFoundError('Notification');
  return ApiResponse.success(res, notification);
};

export const markAllNotificationsRead = async (req: Request, res: Response): Promise<Response> => {
  await Notification.updateMany({ user: req.user!.userId, read: false }, { read: true });
  return ApiResponse.success(res, { success: true }, 'All notifications marked as read');
};

export const getProfile = async (req: Request, res: Response): Promise<Response> => {
  const parent = await requireParent(req);
  return ApiResponse.success(res, parent);
};

export const updateProfile = async (req: Request, res: Response): Promise<Response> => {
  const parent = await Parent.findOne({ user: req.user!.userId });
  if (!parent) throw new NotFoundError('Parent record for this account');
  const { firstName, lastName, phone, occupation, address, preferredLanguage } = req.body || {};
  if (firstName !== undefined || lastName !== undefined) {
    const profile = await Profile.findById(parent.profile);
    if (!profile) throw new NotFoundError('Profile');
    if (firstName !== undefined) profile.firstName = String(firstName).trim();
    if (lastName !== undefined) profile.lastName = String(lastName).trim();
    if (!profile.firstName || !profile.lastName) throw new BadRequestError('First and last name are required');
    await profile.save();
  }
  if (phone !== undefined || preferredLanguage !== undefined) {
    const user = await User.findById(parent.user);
    if (!user) throw new NotFoundError('User');
    if (phone !== undefined) user.phone = String(phone).trim() || undefined;
    if (preferredLanguage !== undefined) user.preferredLanguage = preferredLanguage;
    await user.save();
  }
  if (occupation !== undefined) parent.occupation = String(occupation).trim();
  if (address !== undefined) parent.address = String(address).trim();
  await parent.save();
  return getProfile(req, res);
};
