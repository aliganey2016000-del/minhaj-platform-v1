import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import ExamSeatingPlan from '../models/exam-seating-plan.model';
import ExamRoom from '../models/exam-room.model';
import Student from '../models/student.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { assertOwnOrg, applyOrgFilter } from '../utils/tenant-scope';
import { assertSafeSpreadsheetUpload } from '../utils/spreadsheet-upload';
import { buildXlsxBuffer } from '../utils/xlsx-buffer';

const COLUMNS = ['Organization','Department','Class','Shift','Student ID','Student Name','Academic Year','Exam Type','Room','Seat'];
const norm = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ');
const key = (v: unknown) => norm(v).toLowerCase();
const classOf = (s: any) => norm([s?.class?.title, s?.class?.section].filter(Boolean).join(' '));
const examTypeValue = (v: string) => { const x=key(v); if(x==='mid'||x==='mid exam'||x==='midterm') return 'mid'; if(x==='final'||x==='final exam') return 'final'; return ''; };

async function schoolForStudent(req: Request, student: any) { if(student.school){assertOwnOrg(req,student,'school');return student.school;} return null; }
async function populate(q: any) { return q.populate('room','name building capacity').populate({path:'student',populate:[{path:'profile',select:'firstName lastName'},{path:'class',select:'title section academicYear shiftMode department',populate:{path:'department',select:'name'}},{path:'school',select:'name'}],select:'studentId profile school class department shiftMode'}).lean(); }
function payload(a: any) { const s=a?.student; return {...a,student:s?{...s,organization:s.school?.name||'',department:s.class?.department?.name||s.department||'',className:classOf(s),shift:s.class?.shiftMode||s.shiftMode||'',academicYear:s.class?.academicYear||''}:s}; }

export const list = async (req: Request,res: Response) => { const q=req.query as any; let filter:any={}; if(q.academicYear)filter.academicYear=norm(q.academicYear); if(q.examType)filter.examType=examTypeValue(q.examType); filter=applyOrgFilter(req,filter,'school'); const rows=await populate(ExamSeatingPlan.find(filter).sort({room:1,deskNumber:1})); return ApiResponse.success(res,rows.map(payload)); };

export const rooms = async (req: Request,res: Response) => { const filter=applyOrgFilter(req,{},'school'); const rows=await ExamRoom.find(filter).sort({name:1}).lean(); return ApiResponse.success(res,rows); };

export const add = async (req: Request,res: Response) => { const {organization,studentId,room,seat,academicYear,examType}=req.body as any; if(!studentId||!room||!seat||!academicYear||!examType)throw new BadRequestError('Student ID, Room, Seat, Academic Year and Exam Type are required'); const t=examTypeValue(examType); if(!t)throw new BadRequestError('Exam Type must be Mid Exam or Final'); const student=await Student.findOne({studentId:norm(studentId)}).populate('profile','firstName lastName').populate({path:'class',select:'title section academicYear shiftMode department',populate:{path:'department',select:'name'}}).populate('school','name').lean() as any; if(!student)throw new NotFoundError('Student'); const school=await schoolForStudent(req,student); if(organization&&student.school?.name&&key(organization)!==key(student.school.name))throw new BadRequestError('Organization does not match the student'); const roomDoc=await ExamRoom.findOne({name:norm(room),...(school?{school:school._id||school}:{})}).lean(); if(!roomDoc)throw new NotFoundError('Exam room'); assertOwnOrg(req,roomDoc,'school'); const seatValue=norm(seat); const scope={school:school?._id||school||null,academicYear:norm(academicYear),examType:t}; if(await ExamSeatingPlan.exists({...scope,student:student._id}))throw new BadRequestError('This student already has a seating assignment for this Academic Year and Exam Type'); if(await ExamSeatingPlan.exists({...scope,room:roomDoc._id,deskNumber:seatValue}))throw new BadRequestError(`Seat "${seatValue}" is already occupied in ${roomDoc.name}`); const created=await ExamSeatingPlan.create({student:student._id,room:roomDoc._id,deskNumber:seatValue,academicYear:norm(academicYear),examType:t,school:school?._id||school||null}); const row=await populate(ExamSeatingPlan.findById(created._id)); return ApiResponse.success(res,payload(row),'Seating added'); };

export const update = async (req: Request,res: Response) => { const row=await ExamSeatingPlan.findById(req.params.id); if(!row)throw new NotFoundError('Seating assignment'); const {room,seat,academicYear,examType}=req.body as any; const t=examType?examTypeValue(examType):row.examType; if(!t)throw new BadRequestError('Invalid Exam Type'); const roomDoc=await ExamRoom.findOne({name:norm(room)}); if(!roomDoc)throw new NotFoundError('Exam room'); assertOwnOrg(req,roomDoc,'school'); const seatValue=norm(seat); row.room=roomDoc._id; row.deskNumber=seatValue; row.academicYear=norm(academicYear||row.academicYear); row.examType=t; await row.save(); const populated=await populate(ExamSeatingPlan.findById(row._id)); return ApiResponse.success(res,payload(populated),'Seating updated'); };
export const remove = async (req: Request,res: Response) => { const row=await ExamSeatingPlan.findById(req.params.id); if(!row)throw new NotFoundError('Seating assignment'); assertOwnOrg(req,row,'school'); await row.deleteOne(); return ApiResponse.noContent(res,'Seating removed'); };

// DELETE /exams/seating-plan — bulk-remove a checkbox-selected set of rows.
// org-scoped via applyOrgFilter rather than a per-row assertOwnOrg loop, so
// any ids belonging to another organization are silently excluded from the
// delete rather than aborting the whole batch.
export const bulkRemove = async (req: Request,res: Response) => { const ids=req.body?.ids; if(!Array.isArray(ids)||ids.length===0)throw new BadRequestError('ids is required'); const filter=applyOrgFilter(req,{_id:{$in:ids}},'school'); const result=await ExamSeatingPlan.deleteMany(filter); return ApiResponse.success(res,{deleted:result.deletedCount},`Removed ${result.deletedCount} seating assignment(s)`); };

function readRowsFromFile(req: Request): Record<string, unknown>[] {
  if (!req.file) throw new BadRequestError('An Excel or CSV file is required');
  assertSafeSpreadsheetUpload(req.file);
  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheet = wb.SheetNames[0];
  if (!sheet) throw new BadRequestError('The uploaded file has no sheets');
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheet], { defval: '' });
  if (!rows.length) throw new BadRequestError('The uploaded file has no data rows');
  const headers = Object.keys(rows[0]);
  const missing = COLUMNS.filter((c) => !headers.some((h) => key(h) === key(c)));
  if (missing.length) throw new BadRequestError(`Missing required columns: ${missing.join(', ')}`);
  return rows;
}

// Finds the first free numeric seat across the school's rooms (sorted by
// name) that isn't already used/reserved in this import batch — the basis
// for the "Apply Fix" suggestion on a capacity/duplicate-seat error. Purely
// advisory: the admin still confirms it via Apply Fix, nothing is silently
// changed.
function suggestSeat(allRooms: any[], seenSeats: Set<string>): { room: string; seat: string; seatKey: string } | null {
  for (const r of allRooms) {
    for (let n = 1; n <= r.capacity; n++) {
      const seatVal = String(n);
      const seatKey = `${r._id.toString()}::${key(seatVal)}`;
      if (!seenSeats.has(seatKey)) return { room: r.name, seat: seatVal, seatKey };
    }
  }
  return null;
}

async function validateRows(req: Request, rows: Record<string, unknown>[]) {
  const ids = rows.map((r) => norm(r['Student ID']).toUpperCase()).filter(Boolean);
  const students = (await Student.find({ studentId: { $in: ids } })
    .populate('profile', 'firstName lastName')
    .populate({ path: 'class', select: 'title section academicYear shiftMode department', populate: { path: 'department', select: 'name' } })
    .populate('school', 'name')
    .lean()) as any[];
  const byId = new Map(students.map((s) => [key(s.studentId).toUpperCase(), s]));

  let school: any = null, academicYear = '', type = '', docs: any[] = [], allRooms: any[] = [];
  const preview: any[] = [];
  const seenStudents = new Set<string>(), seenSeats = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const studentId = norm(r['Student ID']).toUpperCase();
    const student = byId.get(key(studentId).toUpperCase());
    const row: any = {
      row: i + 2, organization: norm(r['Organization']), department: norm(r['Department']), className: norm(r['Class']),
      shift: norm(r['Shift']), studentId, studentName: norm(r['Student Name']), academicYear: norm(r['Academic Year']),
      examType: norm(r['Exam Type']), room: norm(r['Room']), seat: norm(r['Seat']), status: 'valid',
    };
    try {
      if (!student) throw new Error(`Student ${studentId} was not found`);
      if (!row.organization || !row.department || !row.className || !row.shift || !row.studentName || !row.academicYear || !row.examType || !row.room || !row.seat) throw new Error('All 10 columns are required');
      const t = examTypeValue(row.examType);
      if (!t) throw new Error('Exam Type must be Mid Exam or Final');
      if (!academicYear) academicYear = row.academicYear;
      if (!type) type = t;
      if (key(row.academicYear) !== key(academicYear) || t !== type) throw new Error('All rows must use the same Academic Year and Exam Type');
      if (!school) school = student.school;
      if (school && allRooms.length === 0) allRooms = await ExamRoom.find({ school: school._id || school }).sort({ name: 1 }).lean();
      if (school?.name && key(row.organization) !== key(school.name)) throw new Error('Organization does not match the student school');
      if (seenStudents.has(studentId)) throw new Error('Duplicate Student ID in file');
      seenStudents.add(studentId);
      const roomDoc = await ExamRoom.findOne({ name: row.room, ...(school ? { school: school._id || school } : {}) });
      if (!roomDoc) throw new Error(`Room "${row.room}" was not found`);
      assertOwnOrg(req, roomDoc, 'school');
      const seatKey = `${roomDoc._id.toString()}::${key(row.seat)}`;
      if (seenSeats.has(seatKey)) {
        const suggestion = suggestSeat(allRooms, seenSeats);
        if (suggestion) { row.suggestion = { room: suggestion.room, seat: suggestion.seat }; seenSeats.add(suggestion.seatKey); }
        throw new Error(`Duplicate seat ${row.seat} in ${row.room}`);
      }
      seenSeats.add(seatKey);
      docs.push({ student: student._id, room: roomDoc._id, deskNumber: row.seat, academicYear: row.academicYear, examType: t, school: school?._id || null });
    } catch (e: any) {
      row.status = 'error';
      row.message = e.message;
    }
    preview.push(row);
  }
  return { preview, docs, school, academicYear, examType: type };
}

function rowsFromJsonBody(req: Request): Record<string, unknown>[] {
  const rows = req.body?.rows;
  if (!Array.isArray(rows) || rows.length === 0) throw new BadRequestError('rows is required');
  return rows.map((r: any) => ({
    Organization: r.organization, Department: r.department, Class: r.className, Shift: r.shift,
    'Student ID': r.studentId, 'Student Name': r.studentName, 'Academic Year': r.academicYear,
    'Exam Type': r.examType, Room: r.room, Seat: r.seat,
  }));
}

export const previewImport = async (req: Request, res: Response) => { const r = await validateRows(req, readRowsFromFile(req)); return ApiResponse.success(res, r.preview); };
export const importExcel = async (req: Request, res: Response) => { const r = await validateRows(req, readRowsFromFile(req)); const errors = r.preview.filter((x: any) => x.status === 'error'); if (errors.length) throw new BadRequestError(`Import blocked: ${errors.length} row(s) need correction`); await ExamSeatingPlan.deleteMany({ school: r.school?._id || r.school || null, academicYear: r.academicYear, examType: r.examType }); if (r.docs.length) await ExamSeatingPlan.insertMany(r.docs); return ApiResponse.success(res, { imported: r.docs.length }, `Imported ${r.docs.length} seating assignments`); };

// ---------------------------------------------------------------------------
// validateRowsJson / importRows — the "Apply Fix" round trip. After a
// capacity/duplicate-seat error offers a suggested {room, seat} and the
// admin accepts it in the preview table, the frontend re-validates and
// (once every row is clean) imports from the corrected in-memory rows
// directly — no need to re-upload/re-edit the original spreadsheet.
// ---------------------------------------------------------------------------

export const validateRowsJson = async (req: Request, res: Response) => { const r = await validateRows(req, rowsFromJsonBody(req)); return ApiResponse.success(res, r.preview); };
export const importRows = async (req: Request, res: Response) => { const r = await validateRows(req, rowsFromJsonBody(req)); const errors = r.preview.filter((x: any) => x.status === 'error'); if (errors.length) throw new BadRequestError(`Import blocked: ${errors.length} row(s) need correction`); await ExamSeatingPlan.deleteMany({ school: r.school?._id || r.school || null, academicYear: r.academicYear, examType: r.examType }); if (r.docs.length) await ExamSeatingPlan.insertMany(r.docs); return ApiResponse.success(res, { imported: r.docs.length }, `Imported ${r.docs.length} seating assignments`); };
export const downloadTemplate=async(_req:Request,res:Response)=>{const sample=[['Minhaj','Department','Class A','Morning','ST001','Ahmed Ali','2026/27','Mid Exam','Room 01','A01']];const buffer=buildXlsxBuffer(COLUMNS,sample,'Exam Seating');res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition','attachment; filename=exam-seating-master-template.xlsx');res.end(buffer);};
