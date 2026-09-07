import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Student from '../models/student.model';
import StudentRegistration from '../models/student-registration.model';
import School from '../models/school.model';
import AcademicStructure from '../models/academic-structure.model';
import Program from '../models/program.model';
import Department from '../models/department.model';
import Faculty from '../models/faculty.model';
import ClassModel from '../models/class.model';
import StudentDocument from '../models/student-document.model';
import StudentDocumentType from '../models/student-document-type.model';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { assertOwnsOrg, assertCanAccessStudent } from '../utils/tenant-scope';
import { resolveInstitutionType, isHigherEdInstitutionType } from '../utils/academic-config';
import { DEFAULT_STUDENT_DOCUMENT_TYPES } from '../utils/student-admission-config';

async function loadStudent(req: Request) {
  const student = await Student.findById(req.params.studentId).lean();
  if (!student) throw new NotFoundError('Student');
  await assertCanAccessStudent(req, student);
  return student;
}

function objectId(value: unknown, field: string): mongoose.Types.ObjectId | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (!mongoose.isValidObjectId(value)) throw new BadRequestError(`${field} must be a valid identifier`);
  return new mongoose.Types.ObjectId(String(value));
}

async function validateReferences(schoolId: any, type: string, payload: any) {
  const program = objectId(payload.program, 'Program');
  const department = objectId(payload.department, 'Department');
  const faculty = objectId(payload.faculty, 'Faculty');
  const classId = objectId(payload.class, 'Class');
  const higherEd = isHigherEdInstitutionType(type as any);
  if (!higherEd && (faculty || department && type === 'training_center')) throw new BadRequestError('Faculty or department is not valid for this organization type');
  if (faculty) {
    const structure = await AcademicStructure.findOne({ school: schoolId }).lean();
    if (!higherEd || !structure?.usesFaculty) throw new BadRequestError('Faculty is not enabled for this organization');
    const doc = await Faculty.findOne({ _id: faculty, tenantId: schoolId }).lean();
    if (!doc) throw new BadRequestError('Faculty does not belong to this organization');
  }
  if (department && !(await Department.exists({ _id: department, tenantId: schoolId }))) throw new BadRequestError('Department does not belong to this organization');
  if (program && !(await Program.exists({ _id: program, school: schoolId }))) throw new BadRequestError('Program does not belong to this organization');
  if (classId && !(await ClassModel.exists({ _id: classId, school: schoolId }))) throw new BadRequestError('Class does not belong to this organization');
  return { program, department, faculty, class: classId };
}

export const get = async (req: Request, res: Response): Promise<Response> => {
  const student = await loadStudent(req);
  const registration = await StudentRegistration.findOne({ student: student._id, school: student.school })
    .populate('program', 'name code').populate('department', 'name code').populate('faculty', 'name code').populate('class', 'title section').lean();
  return ApiResponse.success(res, registration);
};

export const upsert = async (req: Request, res: Response): Promise<Response> => {
  const student = await loadStudent(req);
  if (!student.school) throw new BadRequestError('Student is not assigned to an organization');
  const school = await School.findById(student.school).select('_id institutionType organizationType').lean();
  if (!school) throw new NotFoundError('Organization');
  const organizationType = resolveInstitutionType(school);
  const references = await validateReferences(student.school, organizationType, req.body);
  const applicationStatus = req.body.applicationStatus || 'draft';
  if (['submitted', 'admitted'].includes(applicationStatus)) {
    await Promise.all(DEFAULT_STUDENT_DOCUMENT_TYPES[organizationType].map((item, index) => StudentDocumentType.updateOne(
      { organizationType, school: student.school, code: item.code },
      { $setOnInsert: { ...item, organizationType, school: student.school, maxFileSize: 10 * 1024 * 1024, sortOrder: index } },
      { upsert: true },
    )));
    const requiredTypes = await StudentDocumentType.find({ school: student.school, organizationType, isActive: true, isRequired: true }).select('_id').lean();
    const uploadedTypes = await StudentDocument.find({ student: student._id, school: student.school, documentType: { $in: requiredTypes.map(type => type._id) } }).distinct('documentType');
    const uploaded = new Set(uploadedTypes.map(type => String(type)));
    const missing = requiredTypes.filter(type => !uploaded.has(String(type._id)));
    if (missing.length > 0) throw new BadRequestError('Required student documents are missing. Upload all required documents before submitting.');
  }
  const registration = await StudentRegistration.findOneAndUpdate(
    { student: student._id, school: student.school },
    {
      $set: {
        ...req.body, ...references, applicationStatus, student: student._id, school: student.school,
        organizationType, updatedBy: req.user?.userId,
      },
      $setOnInsert: { createdBy: req.user?.userId, applicationDate: req.body.applicationDate || new Date() },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();
  return ApiResponse.success(res, registration, 'Student registration saved');
};
