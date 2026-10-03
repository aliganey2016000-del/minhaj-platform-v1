import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Certificate from '../models/certificate.model';
import Student from '../models/student.model';
import Course from '../models/course.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import Teacher from '../models/teacher.model';
import Parent from '../models/parent.model';
import { isTenantScoped } from '../utils/tenant-scope';
import ensureStudentRecord from '../utils/ensure-student';
import { castObjectIdFilter } from '../utils/cast-object-id-filter';
import { escapeRegex } from '../utils/escape-regex';

const NONE = new mongoose.Types.ObjectId('000000000000000000000000');

/**
 * Certificates carry no school of their own, so who may see one follows its
 * student: the platform admin sees all, school staff only their own school's
 * students, a teacher only certificates for courses they teach, a student
 * only their own and a parent only their children's.
 */
async function certificateScope(req: Request): Promise<Record<string, unknown>> {
  const role = req.user?.role;
  if (role === 'admin') return {};
  if (isTenantScoped(req) || role === 'staff') {
    if (!req.user?.organizationId) return { student: NONE };
    const ids = await Student.find({ school: req.user.organizationId }).distinct('_id');
    return { student: { $in: ids } };
  }
  if (role === 'teacher') {
    const teacher = await Teacher.findOne({ user: req.user!.userId }).select('_id').lean();
    if (!teacher) return { course: NONE };
    const ids = await Course.find({ teacher: teacher._id }).distinct('_id');
    return { course: { $in: ids } };
  }
  if (role === 'student') {
    const student = await Student.findOne({ user: req.user!.userId }).select('_id').lean();
    return { student: student?._id ?? NONE };
  }
  if (role === 'parent') {
    const parent = await Parent.findOne({ user: req.user!.userId }).select('children').lean();
    return { student: { $in: (parent as any)?.children || [] } };
  }
  return { student: NONE };
}

async function findScopedCertificate(req: Request) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new NotFoundError('Certificate');
  const cert = await Certificate.findOne({ $and: [{ _id: req.params.id }, await certificateScope(req)] }).select('_id').lean();
  if (!cert) throw new NotFoundError('Certificate');
  return cert;
}

// GET /certificates — List all with filters, search, pagination
export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { studentId, courseId, status, page = '1', limit = '20', search } = req.query;

  const filter: Record<string, unknown> = {};
  if (studentId) filter.student = studentId as string;
  if (courseId) filter.course = courseId as string;
  if (status && ['issued', 'revoked', 'expired'].includes(status as string)) filter.status = status;
  const scope = await certificateScope(req);

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 20));

  const populateCerts = (q: ReturnType<typeof Certificate.find>) => q
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .populate('course', 'title.en slug category')
    .populate('issuedBy', 'email');

  let result: any[];
  let total: number;

  if (search) {
    // Previously: paginate first (skip/limit), THEN filter that one page by
    // search in memory — a matching certificate outside the current page
    // never showed up, and `total` reported only how many of that one page
    // matched. Matched and paginated at the database level instead, same as
    // students/teachers/classes/parents/invoices/payments/schools (see
    // student.controller.ts getAll).
    const regex = new RegExp(escapeRegex(search as string), 'i');
    const aggregateMatch = castObjectIdFilter(filter, ['student', 'course']);
    const [facetResult] = await Certificate.aggregate([
      { $match: aggregateMatch },
      { $match: scope },
      { $lookup: { from: 'students', localField: 'student', foreignField: '_id', as: 'studentDoc' } },
      { $unwind: { path: '$studentDoc', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'profiles', localField: 'studentDoc.profile', foreignField: '_id', as: 'profileDoc' } },
      { $unwind: { path: '$profileDoc', preserveNullAndEmptyArrays: true } },
      { $addFields: { fullName: { $concat: [{ $ifNull: ['$profileDoc.firstName', ''] }, ' ', { $ifNull: ['$profileDoc.lastName', ''] }] } } },
      { $match: { $or: [{ fullName: regex }, { 'studentDoc.studentId': regex }, { certificateNumber: regex }, { title: regex }] } },
      { $sort: { createdAt: -1 } },
      { $facet: {
          data: [{ $skip: (pageNum - 1) * limitNum }, { $limit: limitNum }, { $project: { _id: 1 } }],
          totalCount: [{ $count: 'count' }],
        } },
    ]);

    const orderedIds: string[] = (facetResult?.data || []).map((row: any) => String(row._id));
    total = facetResult?.totalCount?.[0]?.count || 0;
    const pageDocs = orderedIds.length
      ? await populateCerts(Certificate.find({ _id: { $in: orderedIds } })).lean()
      : [];
    const docById = new Map((pageDocs as any[]).map((doc) => [String(doc._id), doc]));
    result = orderedIds.map((id) => docById.get(id)).filter(Boolean);
  } else {
    const [certs, count] = await Promise.all([
      populateCerts(Certificate.find({ $and: [filter, scope] }))
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Certificate.countDocuments({ $and: [filter, scope] }),
    ]);
    result = certs;
    total = count;
  }

  return ApiResponse.paginated(res, result, { page: pageNum, limit: limitNum, total });
};

// GET /certificates/:id — one certificate, same visibility as the list
export const getById = async (req: Request, res: Response): Promise<Response> => {
  const { _id } = await findScopedCertificate(req);
  const cert = await Certificate.findById(_id)
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .populate('course', 'title.en slug category')
    .populate('issuedBy', 'email')
    .lean();
  return ApiResponse.success(res, cert);
};

// POST /certificates — Issue a new certificate
export const create = async (req: Request, res: Response): Promise<Response> => {
  const { title, student: studentId, course: courseId, issueDate, expiryDate, grade, notes } = req.body;

  if (!title || !studentId || !courseId) {
    throw new BadRequestError('title, student, and course are required');
  }

  const [student, course] = await Promise.all([
    Student.findById(studentId).lean(),
    Course.findById(courseId).lean(),
  ]);
  if (!student) throw new NotFoundError('Student');
  if (!course) throw new NotFoundError('Course');
  if (req.user?.role !== 'admin') {
    const orgId = req.user?.organizationId;
    if (!orgId || String((student as any).school) !== orgId || String((course as any).school) !== orgId) {
      throw new ForbiddenError('You can only issue certificates for your own organization');
    }
  }

  const cert = await Certificate.create({
    title,
    student: studentId,
    course: courseId,
    issueDate: issueDate || new Date(),
    expiryDate: expiryDate || undefined,
    grade: grade || '',
    notes: notes || '',
    status: 'issued',
    issuedBy: new mongoose.Types.ObjectId(req.user!.userId),
  });

  const populated = await Certificate.findById(cert._id)
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .populate('course', 'title.en slug category')
    .populate('issuedBy', 'email')
    .lean();

  return ApiResponse.created(res, populated, 'Certificate issued successfully');
};

// PATCH /certificates/:id
const EDITABLE_FIELDS = ['title', 'issueDate', 'expiryDate', 'grade', 'notes'];

export const update = async (req: Request, res: Response): Promise<Response> => {
  await findScopedCertificate(req);
  // The student, course, number and issuer are what make a certificate
  // genuine; only its descriptive fields are editable after issue.
  const updates: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) if (req.body?.[key] !== undefined) updates[key] = req.body[key];
  const cert = await Certificate.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .populate('course', 'title.en slug category')
    .populate('issuedBy', 'email')
    .lean();

  if (!cert) throw new NotFoundError('Certificate');
  return ApiResponse.success(res, cert, 'Certificate updated');
};

// PATCH /certificates/:id/status
export const updateStatus = async (req: Request, res: Response): Promise<Response> => {
  const { status } = req.body;
  if (!status || !['issued', 'revoked', 'expired'].includes(status)) {
    throw new BadRequestError('Valid status required: issued, revoked, or expired');
  }
  await findScopedCertificate(req);

  const cert = await Certificate.findByIdAndUpdate(req.params.id, { status }, { new: true })
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .populate('course', 'title.en slug')
    .lean();

  if (!cert) throw new NotFoundError('Certificate');
  return ApiResponse.success(res, cert, `Certificate status updated to ${status}`);
};

// DELETE /certificates/:id
export const remove = async (req: Request, res: Response): Promise<Response> => {
  await findScopedCertificate(req);
  const cert = await Certificate.findByIdAndDelete(req.params.id);
  if (!cert) throw new NotFoundError('Certificate');
  return ApiResponse.noContent(res, 'Certificate deleted');
};

// GET /certificates/my — Student's own certificates
export const getMyCertificates = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);

  const certs = await Certificate.find({ student: student._id })
    .populate('course', 'title.en slug category')
    .populate('issuedBy', 'email')
    .sort({ createdAt: -1 })
    .lean();

  return ApiResponse.success(res, certs);
};
