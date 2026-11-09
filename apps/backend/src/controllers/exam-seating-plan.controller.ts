import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import ExamSeatingPlan from '../models/exam-seating-plan.model';
import ClassModel from '../models/class.model';
import ExamRoom from '../models/exam-room.model';
import Student from '../models/student.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { assertOwnOrg, applyOrgFilter, resolveViewableOrgId } from '../utils/tenant-scope';
import { assertSafeSpreadsheetUpload } from '../utils/spreadsheet-upload';
import { buildXlsxBuffer } from '../utils/xlsx-buffer';
import { getExamSchedulingRulesForSchool } from '../utils/exam-scheduling-rules';
import { savedSeatingShiftLoad, classShiftIndexes } from '../utils/exam-shift-groups';
import { resolveSeatingScope, seatingScopeFilter, SeatingScope } from '../utils/exam-seating-scope';

const COLUMNS = ['Organization','Department','Class','Shift','Student ID','Student Name','Academic Year','Exam Type','Room','Seat'];
const norm = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ');
const key = (v: unknown) => norm(v).toLowerCase();
const classOf = (s: any) => norm([s?.class?.title, s?.class?.section].filter(Boolean).join(' '));
const examTypeValue = (v: string) => { const x=key(v); if(x==='mid'||x==='mid exam'||x==='midterm') return 'mid'; if(x==='final'||x==='final exam') return 'final'; return ''; };

async function schoolForStudent(req: Request, student: any) { if(student.school){assertOwnOrg(req,student,'school');return student.school;} return null; }
async function populate(q: any) { return q.populate('room','name building capacity').populate({path:'student',populate:[{path:'profile',select:'firstName lastName'},{path:'class',select:'title section academicYear shiftMode department',populate:{path:'department',select:'name'}},{path:'school',select:'name'}],select:'studentId profile school class department shiftMode status'}).lean(); }
function payload(a: any) { const s=a?.student; return {...a,student:s?{...s,organization:s.school?.name||'',department:s.class?.department?.name||s.department||'',className:classOf(s),shift:s.class?.shiftMode||s.shiftMode||'',academicYear:s.class?.academicYear||''}:s}; }

// Rows whose student was deleted or is no longer active (e.g. test data,
// graduated students) are not part of the live allocation: they are hidden
// from the list and counts, and removed by the next generate or Reset.
const isLiveRow = (row: any) => Boolean(row?.student?._id) && row.student.status === 'active';

/** Org filter for a scope: a period's own organization, else the caller's tenant filter. */
function scopedPlanFilter(req: Request, scope: SeatingScope) {
  const filter: Record<string, unknown> = seatingScopeFilter(scope);
  return scope.school ? { ...filter, school: scope.school } : applyOrgFilter(req, filter, 'school');
}

export const list = async (req: Request,res: Response) => {
  const q=req.query as any;
  const scope=await resolveSeatingScope(req,{periodId:q.periodId,academicYear:q.academicYear,examType:q.examType},false);
  let filter:any={};
  if(scope) filter=scopedPlanFilter(req,scope);
  else {
    if(q.academicYear)filter.academicYear=norm(q.academicYear);
    if(q.examType)filter.examType=examTypeValue(q.examType);
    filter=applyOrgFilter(req,filter,'school');
  }
  const rows=await populate(ExamSeatingPlan.find(filter).sort({room:1,deskNumber:1}));
  return ApiResponse.success(res,rows.filter(isLiveRow).map(payload));
};

export const rooms = async (req: Request,res: Response) => {
  const schoolId = resolveViewableOrgId(req, req.query.school);
  const filter: Record<string, unknown> = {
    ...(schoolId ? { school: schoolId } : {}),
    capacityMode: { $ne: 'auto' },
    allocationEnabled: { $ne: false },
  };
  if (req.user?.role !== 'admin' && !schoolId) filter.school = '__NO_TENANT__';
  const rows = await ExamRoom.find(filter).sort({ name: 1 }).lean();
  return ApiResponse.success(res, rows);
};

export const stats = async (req: Request,res: Response) => {
  const q=req.query as any;
  const scope=await resolveSeatingScope(req,{periodId:q.periodId,academicYear:q.academicYear,examType:q.examType},false);
  if(!scope) return ApiResponse.success(res,{totalStudents:0,assigned:0,unassigned:0,locked:0,roomsUsed:0});

  const studentFilter=scope.school?{status:'active',school:scope.school}:applyOrgFilter(req,{status:'active'},'school');
  const activeStudentIds=await Student.distinct('_id',studentFilter);
  // Only rows of currently active students count — rows left behind by
  // deleted/inactive students would otherwise push "assigned" past the
  // real student total.
  const planFilter={...scopedPlanFilter(req,scope),student:{$in:activeStudentIds}};
  const totalStudents=activeStudentIds.length;
  const [assigned,locked,roomIds]=await Promise.all([
    ExamSeatingPlan.countDocuments(planFilter),
    ExamSeatingPlan.countDocuments({...planFilter,locked:true}),
    ExamSeatingPlan.distinct('room',planFilter),
  ]);

  return ApiResponse.success(res,{
    totalStudents,
    assigned,
    unassigned:Math.max(totalStudents-assigned,0),
    locked,
    roomsUsed:roomIds.length,
  });
};

export const add = async (req: Request,res: Response) => {
  const {organization,studentId,room,seat,academicYear,examType,periodId}=req.body as any;
  if(!studentId||!room) throw new BadRequestError('Student ID and Room are required');
  const seatingScope=(await resolveSeatingScope(req,{periodId,academicYear,examType}))!;
  const student=await Student.findOne({studentId:norm(studentId)})
    .populate('profile','firstName lastName')
    .populate({path:'class',select:'title section academicYear shiftMode department',populate:{path:'department',select:'name'}})
    .populate('school','name').lean() as any;
  if(!student) throw new NotFoundError('Student');
  const school=await schoolForStudent(req,student);
  if(organization&&student.school?.name&&key(organization)!==key(student.school.name)) throw new BadRequestError('Organization does not match the student');
  const schoolId=school?._id||school||null;
  const roomDoc=await ExamRoom.findOne({name:norm(room),capacityMode:{ $ne:'auto' },allocationEnabled:{ $ne:false },...(schoolId?{school:schoolId}:{})}).lean();
  if(!roomDoc) throw new NotFoundError('Exam room');
  assertOwnOrg(req,roomDoc,'school');
  const seatValue=norm(seat) || `__ROOM_ONLY__${String(student._id)}`;
  const scope={school:schoolId,...seatingScopeFilter(seatingScope)};
  if(await ExamSeatingPlan.exists({...scope,student:student._id})) throw new BadRequestError('This student already has a room assignment for this Academic Year and Exam Type');
  if(!seatValue.startsWith('__ROOM_ONLY__') && await ExamSeatingPlan.exists({...scope,room:roomDoc._id,deskNumber:seatValue})) throw new BadRequestError(`Seat "${seatValue}" is already occupied in ${roomDoc.name}`);

  const rules=await getExamSchedulingRulesForSchool(schoolId);
  if(rules.roomCapacityCheck){
    // Students in other exam shifts (e.g. Secondary vs Primary) reuse the
    // room's seats, so only students sitting in the same shifts count.
    const load=await savedSeatingShiftLoad(rules,{...scope,room:roomDoc._id});
    // Raw department id: the populated department is null if its document is gone.
    const rawClass=student.class?._id?await ClassModel.findById(student.class._id).select('title section department').lean():null;
    const occupied=load.loadFor(String(roomDoc._id),classShiftIndexes(rules,rawClass));
    if(occupied>=Number(roomDoc.capacity||0)){
      throw new BadRequestError(`${roomDoc.name} is full (${occupied}/${roomDoc.capacity} seats used)`);
    }
  }

  const created=await ExamSeatingPlan.create({student:student._id,room:roomDoc._id,deskNumber:seatValue,academicYear:seatingScope.academicYear,examType:seatingScope.examType,period:seatingScope.period,school:schoolId});
  const row=await populate(ExamSeatingPlan.findById(created._id));
  return ApiResponse.success(res,payload(row),'Room assignment added');
};

export const update = async (req: Request,res: Response) => {
  const row=await ExamSeatingPlan.findById(req.params.id);
  if(!row) throw new NotFoundError('Seating assignment');
  assertOwnOrg(req,row,'school');
  const {room,seat,academicYear,examType,locked}=req.body as any;
  // A period's rows always keep that period's year/type.
  const t=row.period?row.examType:(examType?examTypeValue(examType):row.examType);
  if(!t) throw new BadRequestError('Invalid Exam Type');
  const roomDoc=await ExamRoom.findOne({name:norm(room),capacityMode:{ $ne:'auto' },allocationEnabled:{ $ne:false },...(row.school?{school:row.school}:{})}).lean();
  if(!roomDoc) throw new NotFoundError('Exam room');
  assertOwnOrg(req,roomDoc,'school');
  const requestedSeat=norm(seat);
  const seatValue=requestedSeat || (String(row.deskNumber||'').startsWith('__ROOM_ONLY__') ? String(row.deskNumber) : `__ROOM_ONLY__${String(row.student)}`);
  const nextAcademicYear=row.period?row.academicYear:norm(academicYear||row.academicYear);

  if(!seatValue.startsWith('__ROOM_ONLY__')){
    const seatTaken=await ExamSeatingPlan.exists({
      _id:{$ne:row._id}, school:row.school||null, academicYear:nextAcademicYear,
      examType:t, period:row.period||null, room:roomDoc._id, deskNumber:seatValue,
    });
    if(seatTaken) throw new BadRequestError(`Seat "${seatValue}" is already occupied in ${roomDoc.name}`);
  }

  const rules=await getExamSchedulingRulesForSchool(row.school);
  if(rules.roomCapacityCheck){
    const load=await savedSeatingShiftLoad(rules,{
      _id:{$ne:row._id}, school:row.school||null, academicYear:nextAcademicYear,
      examType:t, period:row.period||null, room:roomDoc._id,
    });
    const studentDoc=await Student.findById(row.student).select('class').populate({path:'class',select:'title section department'}).lean() as any;
    const occupied=load.loadFor(String(roomDoc._id),classShiftIndexes(rules,studentDoc?.class||null));
    if(occupied>=Number(roomDoc.capacity||0)){
      throw new BadRequestError(`${roomDoc.name} is full (${occupied}/${roomDoc.capacity} seats used)`);
    }
  }

  row.room=roomDoc._id;
  row.deskNumber=seatValue;
  row.academicYear=nextAcademicYear;
  row.examType=t;
  if (locked !== undefined) row.locked = Boolean(locked);
  await row.save();
  const populated=await populate(ExamSeatingPlan.findById(row._id));
  return ApiResponse.success(res,payload(populated),'Room assignment updated');
};
export const remove = async (req: Request,res: Response) => { const row=await ExamSeatingPlan.findById(req.params.id); if(!row)throw new NotFoundError('Seating assignment'); assertOwnOrg(req,row,'school'); await row.deleteOne(); return ApiResponse.noContent(res,'Seating removed'); };

// DELETE /exams/seating-plan — bulk-remove a checkbox-selected set of rows.
// org-scoped via applyOrgFilter rather than a per-row assertOwnOrg loop, so
// any ids belonging to another organization are silently excluded from the
// delete rather than aborting the whole batch.
export const bulkRemove = async (req: Request,res: Response) => { const ids=req.body?.ids; if(!Array.isArray(ids)||ids.length===0)throw new BadRequestError('ids is required'); const filter=applyOrgFilter(req,{_id:{$in:ids}},'school'); const result=await ExamSeatingPlan.deleteMany(filter); return ApiResponse.success(res,{deleted:result.deletedCount},`Removed ${result.deletedCount} seating assignment(s)`); };

export const bulkLock = async (req: Request,res: Response) => {
  const ids=req.body?.ids;
  const locked=Boolean(req.body?.locked);
  if(!Array.isArray(ids)||ids.length===0) throw new BadRequestError('ids is required');
  const filter=applyOrgFilter(req,{_id:{$in:ids}},'school');
  const result=await ExamSeatingPlan.updateMany(filter,{ $set:{ locked } });
  return ApiResponse.success(
    res,
    { updated: result.modifiedCount, locked },
    locked ? `Locked ${result.modifiedCount} room assignment(s)` : `Unlocked ${result.modifiedCount} room assignment(s)`
  );
};

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

async function validateRows(req: Request, rows: Record<string, unknown>[], seatingScope: SeatingScope | null = null) {
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
      // Imported into an exam period, the period decides the year and type,
      // so those two columns are optional and ignored.
      if (!row.organization || !row.department || !row.className || !row.shift || !row.studentName || (!seatingScope && (!row.academicYear || !row.examType)) || !row.room || !row.seat) throw new Error('All 10 columns are required');
      const t = seatingScope ? seatingScope.examType : examTypeValue(row.examType);
      if (!t) throw new Error('Exam Type must be Mid Exam or Final');
      const rowYear = seatingScope ? seatingScope.academicYear : row.academicYear;
      if (!academicYear) academicYear = rowYear;
      if (!type) type = t;
      if (key(rowYear) !== key(academicYear) || t !== type) throw new Error('All rows must use the same Academic Year and Exam Type');
      if (!school) {
        school = student.school;
      }
      if (school && allRooms.length === 0) allRooms = await ExamRoom.find({ school: school._id || school, capacityMode: { $ne: 'auto' }, allocationEnabled: { $ne: false } }).sort({ name: 1 }).lean();
      if (school?.name && key(row.organization) !== key(school.name)) throw new Error('Organization does not match the student school');
      if (seenStudents.has(studentId)) throw new Error('Duplicate Student ID in file');
      seenStudents.add(studentId);
      const roomDoc = await ExamRoom.findOne({ name: row.room, capacityMode: { $ne: 'auto' }, allocationEnabled: { $ne: false }, ...(school ? { school: school._id || school } : {}) });
      if (!roomDoc) throw new Error(`Room "${row.room}" was not found`);
      assertOwnOrg(req, roomDoc, 'school');
      const seatKey = `${roomDoc._id.toString()}::${key(row.seat)}`;
      if (seenSeats.has(seatKey)) {
        const suggestion = suggestSeat(allRooms, seenSeats);
        if (suggestion) { row.suggestion = { room: suggestion.room, seat: suggestion.seat }; seenSeats.add(suggestion.seatKey); }
        throw new Error(`Duplicate seat ${row.seat} in ${row.room}`);
      }
      // Room capacity is a soft planning number for this bulk import — the
      // admin may deliberately exceed it (overflow seating, temporary extra
      // chairs, etc). Only a genuine room+seat collision above is blocked;
      // see the module comment and seating-import-smart-fix.e2e.ts.
      seenSeats.add(seatKey);
      docs.push({ student: student._id, room: roomDoc._id, deskNumber: row.seat, academicYear: rowYear, examType: t, period: seatingScope?.period || null, school: school?._id || null });
    } catch (e: any) {
      row.status = 'error';
      row.message = e.message;
    }
    preview.push(row);
  }
  return { preview, docs, school, academicYear, examType: type, period: seatingScope?.period || null };
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

const importScope = (req: Request) => resolveSeatingScope(req, { periodId: (req.query as any)?.periodId || req.body?.periodId }, false);
export const previewImport = async (req: Request, res: Response) => { const r = await validateRows(req, readRowsFromFile(req), await importScope(req)); return ApiResponse.success(res, r.preview); };
export const importExcel = async (req: Request, res: Response) => { const r = await validateRows(req, readRowsFromFile(req), await importScope(req)); const errors = r.preview.filter((x: any) => x.status === 'error'); if (errors.length) throw new BadRequestError(`Import blocked: ${errors.length} row(s) need correction`); await ExamSeatingPlan.deleteMany({ school: r.school?._id || r.school || null, academicYear: r.academicYear, examType: r.examType, period: r.period }); if (r.docs.length) await ExamSeatingPlan.insertMany(r.docs); return ApiResponse.success(res, { imported: r.docs.length, academicYear: r.academicYear, examType: r.examType }, `Imported ${r.docs.length} seating assignments`); };

// ---------------------------------------------------------------------------
// validateRowsJson / importRows — the "Apply Fix" round trip. After a
// capacity/duplicate-seat error offers a suggested {room, seat} and the
// admin accepts it in the preview table, the frontend re-validates and
// (once every row is clean) imports from the corrected in-memory rows
// directly — no need to re-upload/re-edit the original spreadsheet.
// ---------------------------------------------------------------------------

export const validateRowsJson = async (req: Request, res: Response) => { const r = await validateRows(req, rowsFromJsonBody(req), await importScope(req)); return ApiResponse.success(res, r.preview); };
export const importRows = async (req: Request, res: Response) => { const r = await validateRows(req, rowsFromJsonBody(req), await importScope(req)); const errors = r.preview.filter((x: any) => x.status === 'error'); if (errors.length) throw new BadRequestError(`Import blocked: ${errors.length} row(s) need correction`); await ExamSeatingPlan.deleteMany({ school: r.school?._id || r.school || null, academicYear: r.academicYear, examType: r.examType, period: r.period }); if (r.docs.length) await ExamSeatingPlan.insertMany(r.docs); return ApiResponse.success(res, { imported: r.docs.length, academicYear: r.academicYear, examType: r.examType }, `Imported ${r.docs.length} seating assignments`); };

// POST /exams/seating-plan/reset — removes the whole allocation of an exam
// period (or a legacy year + type), locked rows included, e.g. to clear
// test data before generating the real plan.
export const reset = async (req: Request, res: Response) => {
  const scope = (await resolveSeatingScope(req, { periodId: req.body?.periodId, academicYear: req.body?.academicYear, examType: req.body?.examType }))!;
  const result = await ExamSeatingPlan.deleteMany(scopedPlanFilter(req, scope));
  return ApiResponse.success(res, { deleted: result.deletedCount }, `Removed ${result.deletedCount} room assignment(s)${scope.periodName ? ` from ${scope.periodName}` : ''}`);
};
export const downloadTemplate=async(_req:Request,res:Response)=>{const sample=[['Minhaj','Department','Class A','Morning','ST001','Ahmed Ali','2026/27','Mid Exam','Room 01','A01']];const buffer=buildXlsxBuffer(COLUMNS,sample,'Exam Seating');res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition','attachment; filename=exam-seating-master-template.xlsx');res.end(buffer);};
