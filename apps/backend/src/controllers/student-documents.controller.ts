import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Student from '../models/student.model';
import StudentDocument from '../models/student-document.model';
import StudentDocumentType from '../models/student-document-type.model';
import School from '../models/school.model';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { assertCanAccessStudent, assertOwnsOrg } from '../utils/tenant-scope';
import { resolveInstitutionType } from '../utils/academic-config';
import { DEFAULT_STUDENT_DOCUMENT_TYPES } from '../utils/student-admission-config';
import { cloudinaryEnabled, deleteFromCloudinary, getCloudinaryPrivateUrl, uploadToCloudinary } from '../utils/cloudinary-storage';

const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };
const DOCUMENT_TYPES = new Set(['application/pdf', ...Object.keys(IMAGE_TYPES)]);
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;

function requireUser(req: Request): string {
  if (!req.user?.userId) throw new ForbiddenError('Authenticated user is required');
  return req.user.userId;
}

async function getStudent(req: Request) {
  const student = await Student.findById(req.params.studentId || req.params.id).lean();
  if (!student) throw new NotFoundError('Student');
  await assertCanAccessStudent(req, student);
  return student;
}

export async function persistStudentPhoto(profileId: any, schoolId: any, file: Express.Multer.File): Promise<string> {
  validateImage(file);
  if (cloudinaryEnabled) {
    const uploaded = await uploadToCloudinary(file.buffer, `student-photos/${String(schoolId || 'unassigned')}`, 'image');
    const profile = await mongoose.model('Profile').findById(profileId);
    if (!profile) throw new NotFoundError('Student profile');
    profile.avatar = uploaded.url;
    await profile.save();
    return uploaded.url;
  }
  const directory = path.join(process.cwd(), 'uploads', 'student-photos', String(schoolId || 'unassigned'));
  fs.mkdirSync(directory, { recursive: true });
  const filename = `${profileId}-${crypto.randomUUID()}${IMAGE_TYPES[file.mimetype]}`;
  fs.writeFileSync(path.join(directory, filename), file.buffer);
  const profile = await mongoose.model('Profile').findById(profileId);
  if (!profile) throw new NotFoundError('Student profile');
  const oldAvatar = profile.avatar;
  profile.avatar = `/uploads/student-photos/${schoolId || 'unassigned'}/${filename}`;
  await profile.save();
  if (oldAvatar) { const oldPath = path.join(process.cwd(), oldAvatar.replace(/^\//, '')); if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); }
  return profile.avatar;
}

function validateImage(file: Express.Multer.File, maxSize = MAX_PHOTO_SIZE): void {
  if (!IMAGE_TYPES[file.mimetype]) throw new BadRequestError('Only JPEG, PNG, GIF, and WebP images are supported');
  if (file.size > maxSize) throw new BadRequestError(`Image must be ${Math.floor(maxSize / 1024 / 1024)} MB or smaller`);
  const header = file.buffer.subarray(0, 12);
  const valid = file.mimetype === 'image/jpeg' ? header[0] === 0xff && header[1] === 0xd8
    : file.mimetype === 'image/png' ? header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : file.mimetype === 'image/gif' ? header.subarray(0, 6).toString() === 'GIF87a' || header.subarray(0, 6).toString() === 'GIF89a'
        : header.subarray(0, 4).toString() === 'RIFF' && header.subarray(8, 12).toString() === 'WEBP';
  if (!valid) throw new BadRequestError('The uploaded image content is invalid');
}

async function ensureDefaultTypes(school: any) {
  const organizationType = resolveInstitutionType(school);
  const defaults = DEFAULT_STUDENT_DOCUMENT_TYPES[organizationType];
  await Promise.all(defaults.map((item, index) => StudentDocumentType.updateOne(
    { organizationType, school: school._id, code: item.code },
    { $setOnInsert: { ...item, organizationType, school: school._id, maxFileSize: 10 * 1024 * 1024, sortOrder: index } },
    { upsert: true },
  )));
  return StudentDocumentType.find({ organizationType, school: school._id, isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
}

export const getDocumentTypes = async (req: Request, res: Response): Promise<Response> => {
  let schoolId: any;
  if (req.params.studentId) {
    const student = await getStudent(req);
    schoolId = student.school;
  } else {
    schoolId = req.query.schoolId;
    if (!schoolId || !mongoose.isValidObjectId(String(schoolId))) throw new BadRequestError('Organization is required');
    if (req.user?.role === 'org_admin' && String(schoolId) !== req.user.organizationId) throw new ForbiddenError('You can only access your organization document types');
  }
  if (!schoolId) throw new BadRequestError('Student is not assigned to an organization');
  const school = await School.findById(schoolId).select('_id institutionType organizationType').lean();
  if (!school) throw new NotFoundError('Organization');
  return ApiResponse.success(res, await ensureDefaultTypes(school));
};

export const list = async (req: Request, res: Response): Promise<Response> => {
  const student = await getStudent(req);
  const documents = await StudentDocument.find({ student: student._id, school: student.school })
    .populate('documentType', 'code name category isRequired').sort({ createdAt: -1 }).lean();
  return ApiResponse.success(res, documents);
};

export const upload = async (req: Request, res: Response): Promise<Response> => {
  const userId = requireUser(req);
  const student = await getStudent(req);
  if (!req.file) throw new BadRequestError('Document file is required');
  if (!student.school) throw new BadRequestError('Student is not assigned to an organization');
  const documentType = await StudentDocumentType.findOne({ _id: req.body.documentType, school: student.school, isActive: true }).lean();
  if (!documentType) throw new BadRequestError('Invalid document type for this organization');
  if (!documentType.allowedMimeTypes.includes(req.file.mimetype)) throw new BadRequestError('This file type is not allowed for the selected document type');
  if (req.file.size > documentType.maxFileSize) throw new BadRequestError('The uploaded document exceeds the configured size limit');

  const directory = path.join(process.cwd(), 'uploads', 'student-documents', String(student.school), String(student._id));
  fs.mkdirSync(directory, { recursive: true });
  const safeName = (req.file.originalname || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
  const filename = `${crypto.randomUUID()}-${safeName}`;
  let fileUrl = '';
  let storageProvider: 'local' | 'cloudinary' = 'local';
  let storagePublicId: string | undefined;
  if (cloudinaryEnabled) {
    const uploaded = await uploadToCloudinary(req.file.buffer, `student-documents/${String(student.school)}/${String(student._id)}`);
    fileUrl = uploaded.url;
    storageProvider = uploaded.provider;
    storagePublicId = uploaded.publicId;
  } else {
    fs.writeFileSync(path.join(directory, filename), req.file.buffer);
    fileUrl = `/uploads/student-documents/${student.school}/${student._id}/${filename}`;
  }
  const document = await StudentDocument.create({
    student: student._id, school: student.school, documentType: documentType._id,
    title: String(req.body.title || documentType.name).trim(), fileUrl, storageProvider, storagePublicId,
    fileName: req.file.originalname || filename, mimeType: req.file.mimetype, fileSize: req.file.size,
    documentNumber: req.body.documentNumber || undefined, issuedDate: req.body.issuedDate || undefined,
    expiryDate: req.body.expiryDate || undefined, issuedBy: req.body.issuedBy || undefined,
    notes: req.body.notes || undefined, createdBy: userId, updatedBy: userId,
  });
  return ApiResponse.created(res, document, 'Student document uploaded successfully');
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const student = await getStudent(req);
  const document = await StudentDocument.findOne({ _id: req.params.documentId, student: student._id, school: student.school });
  if (!document) throw new NotFoundError('Student document');
  await StudentDocument.deleteOne({ _id: document._id });
  if (document.storageProvider === 'cloudinary' && document.storagePublicId) await deleteFromCloudinary(document.storagePublicId);
  else { const filePath = path.join(process.cwd(), document.fileUrl.replace(/^\//, '')); if (fs.existsSync(filePath)) fs.unlinkSync(filePath); }
  return ApiResponse.noContent(res, 'Student document deleted');
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const userId = requireUser(req);
  const student = await getStudent(req);
  const document = await StudentDocument.findOne({ _id: req.params.documentId, student: student._id, school: student.school });
  if (!document) throw new NotFoundError('Student document');
  if (req.file) {
    const type = await StudentDocumentType.findOne({ _id: document.documentType, school: student.school, isActive: true }).lean();
    if (!type || !type.allowedMimeTypes.includes(req.file.mimetype)) throw new BadRequestError('This file type is not allowed for the document type');
    if (req.file.size > type.maxFileSize) throw new BadRequestError('The replacement document exceeds the configured size limit');
    const directory = path.join(process.cwd(), 'uploads', 'student-documents', String(student.school), String(student._id));
    fs.mkdirSync(directory, { recursive: true });
    const safeName = (req.file.originalname || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `${crypto.randomUUID()}-${safeName}`;
    let nextUrl = '';
    let nextProvider: 'local' | 'cloudinary' = 'local';
    let nextPublicId: string | undefined;
    if (cloudinaryEnabled) {
      const uploaded = await uploadToCloudinary(req.file.buffer, `student-documents/${String(student.school)}/${String(student._id)}`);
      nextUrl = uploaded.url; nextProvider = uploaded.provider; nextPublicId = uploaded.publicId;
    } else {
      fs.writeFileSync(path.join(directory, filename), req.file.buffer);
      nextUrl = `/uploads/student-documents/${student.school}/${student._id}/${filename}`;
    }
    if (document.storageProvider === 'cloudinary' && document.storagePublicId) await deleteFromCloudinary(document.storagePublicId);
    else { const oldPath = path.join(process.cwd(), document.fileUrl.replace(/^\//, '')); if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); }
    document.fileUrl = nextUrl;
    document.storageProvider = nextProvider;
    document.storagePublicId = nextPublicId;
    document.fileName = req.file.originalname || filename;
    document.mimeType = req.file.mimetype;
    document.fileSize = req.file.size;
  }
  for (const field of ['title', 'documentNumber', 'issuedDate', 'expiryDate', 'issuedBy', 'notes', 'status'] as const) {
    if (req.body[field] !== undefined) (document as any)[field] = req.body[field] || undefined;
  }
  document.updatedBy = new mongoose.Types.ObjectId(userId);
  await document.save();
  return ApiResponse.success(res, document, 'Student document updated');
};

export const view = async (req: Request, res: Response): Promise<void> => {
  const student = await getStudent(req);
  const document = await StudentDocument.findOne({ _id: req.params.documentId, student: student._id, school: student.school }).lean();
  if (!document) throw new NotFoundError('Student document');
  if (document.storageProvider === 'cloudinary' && document.storagePublicId) {
    res.redirect(getCloudinaryPrivateUrl(document.storagePublicId));
    return;
  }
  const filePath = path.join(process.cwd(), document.fileUrl.replace(/^\//, ''));
  if (!fs.existsSync(filePath)) throw new NotFoundError('Document file');
  res.setHeader('Content-Type', document.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(document.fileName)}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  fs.createReadStream(filePath).pipe(res);
};

export const uploadPhoto = async (req: Request, res: Response): Promise<Response> => {
  const student = await getStudent(req);
  if (!req.file) throw new BadRequestError('Photo file is required');
  const avatar = await persistStudentPhoto(student.profile, student.school, req.file);
  return ApiResponse.success(res, { avatar }, 'Student photo updated');
};
