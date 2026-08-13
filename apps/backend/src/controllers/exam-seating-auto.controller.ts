import { Request, Response } from 'express';
import ExamSeatingPlan from '../models/exam-seating-plan.model';
import ExamRoom from '../models/exam-room.model';
import Student from '../models/student.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError } from '../utils/api-error';
import { assertOwnOrg } from '../utils/tenant-scope';

const norm = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ');
const key = (v: unknown) => norm(v).toLowerCase();
const examTypeValue = (v: string) => { const x = key(v); if (x === 'mid' || x === 'mid exam' || x === 'midterm') return 'mid'; if (x === 'final' || x === 'final exam') return 'final'; return ''; };
const className = (s: any) => norm([s?.class?.title, s?.class?.section].filter(Boolean).join(' '));
const departmentName = (s: any) => norm(s?.class?.department?.name || s?.department?.name || s?.department || '');
const shiftName = (s: any) => norm(s?.class?.shiftMode || s?.shiftMode || '');

export const generate = async (req: Request, res: Response) => {
  const { academicYear, examType, maxPerRoom = 12, seatMode = 'none', overwrite = false, organization = '', department = '', className: classFilter = '', shift = '' } = req.body as any;
  const year = norm(academicYear);
  const type = examTypeValue(norm(examType));
  const perRoom = Number(maxPerRoom);
  if (!year) throw new BadRequestError('Academic Year is required');
  if (!type) throw new BadRequestError('Exam Type must be Mid Exam or Final');
  if (!Number.isInteger(perRoom) || perRoom < 10 || perRoom > 15) throw new BadRequestError('Students per room must be between 10 and 15');
  if (!['none', 'sequential'].includes(seatMode)) throw new BadRequestError('Invalid seat mode');

  const schoolId = (req.user as any)?.schoolId;
  const studentQuery: any = { status: 'active' };
  if (schoolId) studentQuery.school = schoolId;
  const students = await Student.find(studentQuery).populate('profile', 'firstName lastName').populate('school', 'name').populate({ path: 'class', select: 'title section academicYear shiftMode department', populate: { path: 'department', select: 'name' } }).lean() as any[];
  students.forEach(s => { if (s.school) assertOwnOrg(req, s, 'school'); });
  const selected = students.filter(s => (!organization || key(s.school?.name) === key(organization)) && (!department || key(departmentName(s)) === key(department)) && (!classFilter || key(className(s)) === key(classFilter)) && (!shift || key(shiftName(s)) === key(shift)));
  if (!selected.length) throw new BadRequestError('No active students matched the selected filters');

  const rooms = await ExamRoom.find(schoolId ? { school: schoolId } : {}).sort({ name: 1 }).lean();
  rooms.forEach(r => assertOwnOrg(req, r, 'school'));
  const groupCount = Math.ceil(selected.length / perRoom);
  if (rooms.length < groupCount) throw new BadRequestError(`Not enough rooms. ${selected.length} students require ${groupCount} rooms at ${perRoom} students per room.`);
  const activeRooms = rooms.slice(0, groupCount);
  const base = Math.floor(selected.length / groupCount);
  const remainder = selected.length % groupCount;
  const groups: any[][] = [];
  let cursor = 0;
  for (let i = 0; i < groupCount; i++) { const size = base + (i < remainder ? 1 : 0); const group = selected.slice(cursor, cursor + size); cursor += size; if (size > Number(activeRooms[i].capacity)) throw new BadRequestError(`${activeRooms[i].name} capacity is ${activeRooms[i].capacity}, but ${size} students were assigned`); groups.push(group); }

  const scope: any = { academicYear: year, examType: type, school: schoolId || null };
  const selectedIds = selected.map(s => s._id);
  const existing = await ExamSeatingPlan.countDocuments({ ...scope, student: { $in: selectedIds } });
  if (existing && !overwrite) throw new BadRequestError(`Some selected students already have seating for ${year} / ${type}. Enable Regenerate existing plan to replace their assignments.`);
  if (overwrite) await ExamSeatingPlan.deleteMany({ ...scope, student: { $in: selectedIds } });

  const docs: any[] = [];
  groups.forEach((group, roomIndex) => group.forEach((student, index) => docs.push({ student: student._id, room: activeRooms[roomIndex]._id, deskNumber: seatMode === 'sequential' ? `S${String(index + 1).padStart(2, '0')}` : '', academicYear: year, examType: type, school: schoolId || student.school?._id || null })));
  await ExamSeatingPlan.insertMany(docs);
  return ApiResponse.success(res, { academicYear: year, examType: type, students: selected.length, rooms: groupCount, studentsPerRoom: perRoom, seatMode, roomBreakdown: groups.map((g, i) => ({ room: activeRooms[i].name, capacity: activeRooms[i].capacity, students: g.length })) }, `Generated seating for ${selected.length} students across ${groupCount} rooms`);
};
