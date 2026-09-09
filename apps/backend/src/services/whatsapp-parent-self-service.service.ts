import Parent from '../models/parent.model';
import Student from '../models/student.model';
import Attendance from '../models/attendance.model';
import Invoice from '../models/invoice.model';
import Result from '../models/result.model';
import Exam from '../models/exam.model';
import Assignment from '../models/assignment.model';
import AssignmentSubmission from '../models/assignment-submission.model';
import WhatsAppConversation from '../models/whatsapp-conversation.model';
import { sendWhatsAppMessage } from '../utils/whatsapp';

const MENU = [
  'Minhaj Platform — Parent Services',
  '1. Attendance',
  '2. Fees',
  '3. Results',
  '4. Assignments',
  '5. Exams',
  '6. Children',
  '',
  'Reply with a number. Type MENU anytime for the main menu.',
].join('\n');

const HELP = `${MENU}\n\nCommands: MENU, CHILD 1, CHILD 2...`;

function normalizePhone(value: string) {
  return value.replace(/\D/g, '');
}

function money(value: number) {
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function date(value?: Date | string | null) {
  if (!value) return 'Not scheduled';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: process.env.APP_TIMEZONE || 'Africa/Mogadishu' }).format(new Date(value));
}

async function childrenForParent(parent: any) {
  const ids = Array.isArray(parent.children) ? parent.children : [];
  if (!ids.length) return [];
  return Student.find({ _id: { $in: ids }, parent: parent._id, status: 'active' })
    .populate('profile', 'firstName lastName')
    .populate('class', 'title name')
    .select('studentId profile class grade enrolledCourses')
    .lean();
}

function childName(student: any) {
  const profile = student.profile as any;
  const name = profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() : '';
  return name || student.studentId || 'Student';
}

async function chooseStudent(parent: any, conversation: any, text: string) {
  const children = await childrenForParent(parent);
  if (!children.length) {
    await sendWhatsAppMessage({ to: parent.phone, text: 'No active students are linked to your parent account. Please contact your institution.', organizationId: String(conversation.organization) });
    return null;
  }

  const normalized = text.trim().toLowerCase();
  const childCommand = normalized.match(/^child\s+(\d+)$/);
  const index = childCommand ? Number(childCommand[1]) : conversation.botAwaitingChildSelection && /^\d+$/.test(normalized) ? Number(normalized) : 0;
  if (!index || index < 1 || index > children.length) return undefined;

  const selected = children[index - 1];
  await WhatsAppConversation.updateOne(
    { _id: conversation._id, organization: conversation.organization },
    { $set: { botSelectedStudent: selected._id, botAwaitingChildSelection: false } },
  );
  return selected;
}

async function sendChildren(parent: any, conversation: any) {
  const children = await childrenForParent(parent);
  if (!children.length) return 'No active students are linked to your parent account.';
  if (children.length === 1) {
    await WhatsAppConversation.updateOne({ _id: conversation._id }, { $set: { botSelectedStudent: children[0]._id, botAwaitingChildSelection: false } });
    return `Selected child: ${childName(children[0])}. You can now choose Attendance, Fees, Results, Assignments, or Exams.`;
  }
  await WhatsAppConversation.updateOne({ _id: conversation._id }, { $set: { botAwaitingChildSelection: true } });
  return ['Select a child:', ...children.map((student, index) => `${index + 1}. ${childName(student)}${student.grade ? ` — ${student.grade}` : ''}`), '', 'Reply with the number, e.g. 1.'].join('\n');
}

async function attendance(student: any) {
  const rows = await Attendance.find({ student: student._id }).sort({ date: -1 }).limit(30).populate('course', 'title').lean();
  if (!rows.length) return `${childName(student)} has no attendance records yet.`;
  const counts = rows.reduce((acc: any, row: any) => { acc[row.status] = (acc[row.status] || 0) + 1; return acc; }, {});
  const recent = rows.slice(0, 8).map((row: any) => `${date(row.date)} — ${row.course?.title?.en || row.course?.title || 'Course'} — ${String(row.status).toUpperCase()}`);
  return [`Attendance — ${childName(student)}`, `Present: ${counts.present || 0}`, `Late: ${counts.late || 0}`, `Absent: ${counts.absent || 0}`, `Excused: ${counts.excused || 0}`, '', 'Recent:', ...recent].join('\n');
}

async function fees(student: any) {
  const invoices = await Invoice.find({ student: student._id, status: { $ne: 'void' } }).sort({ dueDate: 1, createdAt: -1 }).limit(12).lean();
  if (!invoices.length) return `${childName(student)} has no outstanding invoices.`;
  const outstanding = invoices.filter((invoice: any) => invoice.status !== 'paid');
  const balance = outstanding.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.amount || 0) - Number(invoice.discount || 0) - Number(invoice.amountPaid || 0)), 0);
  const lines = outstanding.slice(0, 6).map((invoice: any) => {
    const due = Math.max(0, Number(invoice.amount || 0) - Number(invoice.discount || 0) - Number(invoice.amountPaid || 0));
    return `${invoice.title} — ${money(due)} due ${date(invoice.dueDate)}`;
  });
  return [`Fees — ${childName(student)}`, `Outstanding balance: ${money(balance)}`, '', ...(lines.length ? lines : ['All invoices are paid.'])].join('\n');
}

async function results(student: any) {
  const rows = await Result.find({ student: student._id })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate({ path: 'exam', select: 'title resultsPublished examDate course', populate: { path: 'course', select: 'title' } })
    .lean();
  const published = rows.filter((row: any) => row.exam?.resultsPublished);
  if (!published.length) return `${childName(student)} has no published exam results yet.`;
  return [`Results — ${childName(student)}`, ...published.slice(0, 8).map((row: any) => `${row.exam?.title || 'Exam'} — ${row.marksObtained}/${row.totalMarks} (${row.percentage}%) — Grade ${row.grade} — ${row.status}`)].join('\n');
}

async function assignments(student: any) {
  const courseIds = Array.isArray(student.enrolledCourses) ? student.enrolledCourses : [];
  if (!courseIds.length) return `${childName(student)} has no active course assignments.`;
  const rows = await Assignment.find({ course: { $in: courseIds }, status: 'active', dueDate: { $gte: new Date() } })
    .sort({ dueDate: 1 }).limit(12).populate('course', 'title').lean();
  if (!rows.length) return `${childName(student)} has no upcoming assignments.`;
  const submitted = await AssignmentSubmission.find({ student: student._id, assignment: { $in: rows.map((row: any) => row._id) } }).select('assignment').lean();
  const submittedSet = new Set(submitted.map((row: any) => String(row.assignment)));
  const pending = rows.filter((row: any) => !submittedSet.has(String(row._id)));
  if (!pending.length) return `${childName(student)} has no pending assignments.`;
  return [`Assignments — ${childName(student)}`, ...pending.slice(0, 8).map((row: any) => `${row.title} — ${row.course?.title?.en || row.course?.title || 'Course'} — due ${date(row.dueDate)}`)].join('\n');
}

async function exams(student: any) {
  const courseIds = Array.isArray(student.enrolledCourses) ? student.enrolledCourses : [];
  if (!courseIds.length) return `${childName(student)} has no active courses with scheduled exams.`;
  const rows = await Exam.find({ course: { $in: courseIds }, status: { $in: ['scheduled', 'ongoing'] }, resultsPublished: false, $or: [{ autoSchedule: true }, { examDate: { $gte: new Date() } }] })
    .sort({ examDate: 1 }).limit(10).populate('course', 'title').lean();
  if (!rows.length) return `${childName(student)} has no upcoming exams.`;
  return [`Exams — ${childName(student)}`, ...rows.slice(0, 8).map((row: any) => `${row.title} — ${row.course?.title?.en || row.course?.title || 'Course'} — ${row.autoSchedule ? 'Personal schedule' : date(row.examDate)}${row.room ? ` — Room ${row.room}` : ''}`)].join('\n');
}

export async function handleParentBotMessage(input: { organizationId: string; from: string; text: string; parentId?: string; conversationId?: string }) {
  const from = normalizePhone(input.from);
  const parent = input.parentId
    ? await Parent.findOne({ _id: input.parentId, phone: { $in: [from, `+${from}`] }, school: input.organizationId }).lean()
    : await Parent.findOne({ phone: { $in: [from, `+${from}`] }, school: input.organizationId }).lean();
  if (!parent) {
    await sendWhatsAppMessage({ to: from, text: 'This WhatsApp number is not linked to a parent account in this institution. Please contact your institution administrator.', organizationId: input.organizationId });
    return { handled: true, action: 'unlinked' };
  }

  const conversation = input.conversationId
    ? await WhatsAppConversation.findOne({ _id: input.conversationId, organization: input.organizationId, parent: parent._id })
    : await WhatsAppConversation.findOne({ organization: input.organizationId, phone: from, parent: parent._id });
  if (!conversation) return { handled: false, action: 'conversation_missing' };

  const text = input.text.trim();
  const normalized = text.toLowerCase();
  if (!text || ['help', 'menu', 'hi', 'hello', '0'].includes(normalized)) {
    await WhatsAppConversation.updateOne({ _id: conversation._id }, { $set: { botAwaitingChildSelection: false } });
    await sendWhatsAppMessage({ to: from, text: MENU, organizationId: input.organizationId });
    return { handled: true, action: 'menu' };
  }

  if (normalized === '6' || normalized === 'children') {
    await sendWhatsAppMessage({ to: from, text: await sendChildren(parent, conversation), organizationId: input.organizationId });
    return { handled: true, action: 'children' };
  }

  const selected = await chooseStudent(parent, conversation, text);
  if (selected) {
    await sendWhatsAppMessage({ to: from, text: `Selected ${childName(selected)}. Reply 1 for Attendance, 2 for Fees, 3 for Results, 4 for Assignments, or 5 for Exams.`, organizationId: input.organizationId });
    return { handled: true, action: 'child:selected' };
  }

  let student: any = null;
  if (conversation.botSelectedStudent) {
    student = await Student.findOne({ _id: conversation.botSelectedStudent, parent: parent._id, status: 'active' }).populate('profile', 'firstName lastName').lean();
  }
  if (!student) {
    const children = await childrenForParent(parent);
    if (children.length === 1) {
      student = children[0];
      await WhatsAppConversation.updateOne({ _id: conversation._id }, { $set: { botSelectedStudent: student._id, botAwaitingChildSelection: false } });
    } else {
      await sendWhatsAppMessage({ to: from, text: await sendChildren(parent, conversation), organizationId: input.organizationId });
      return { handled: true, action: 'choose-child' };
    }
  }

  let reply: string;
  switch (normalized) {
    case '1': reply = await attendance(student); break;
    case '2': reply = await fees(student); break;
    case '3': reply = await results(student); break;
    case '4': reply = await assignments(student); break;
    case '5': reply = await exams(student); break;
    default: reply = HELP;
  }
  await sendWhatsAppMessage({ to: from, text: reply, organizationId: input.organizationId });
  return { handled: true, action: `menu:${normalized}` };
}
