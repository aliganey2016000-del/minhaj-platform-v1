import mongoose from 'mongoose';
import Attendance from '../models/attendance.model';
import Student from '../models/student.model';
import Parent from '../models/parent.model';
import Profile from '../models/profile.model';
import Course from '../models/course.model';
import ClassSchedule from '../models/class-schedule.model';
import WhatsAppMessage from '../models/whatsapp-message.model';
import TelegramMessage from '../models/telegram-message.model';
import { getWhatsAppProvider, isWhatsAppConfigured, sendWhatsAppMessage } from '../utils/whatsapp';
import { isTelegramConfigured, sendTelegramMessage } from '../utils/telegram';

type AttendanceOp = {
  updateOne?: {
    filter?: Record<string, any>;
    update?: Record<string, any>;
  };
};

function whatsappEnabled() {
  return process.env.WHATSAPP_ATTENDANCE_ALERTS_ENABLED?.trim().toLowerCase() === 'true';
}

function telegramEnabled() {
  return process.env.TELEGRAM_ATTENDANCE_ALERTS_ENABLED?.trim().toLowerCase() === 'true';
}

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: process.env.APP_TIMEZONE || 'Africa/Mogadishu',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

async function sendForAttendance(ops: AttendanceOp[]) {
  const whatsappOn = whatsappEnabled() && isWhatsAppConfigured();
  const whatsappTemplate = process.env.WHATSAPP_ATTENDANCE_TEMPLATE?.trim();
  const whatsappProvider = getWhatsAppProvider();
  const telegramOn = telegramEnabled() && isTelegramConfigured();
  if ((!whatsappOn || (whatsappProvider !== 'Baileys' && !whatsappTemplate)) && !telegramOn) return;

  const languageCode = process.env.WHATSAPP_ATTENDANCE_TEMPLATE_LANGUAGE?.trim() || 'en_US';
  const events = ops
    .map((op) => {
      const item = op.updateOne;
      const filter = item?.filter;
      const set = item?.update?.$set as Record<string, any> | undefined;
      const status = set?.status;
      if (!filter?.student || !filter?.course || !filter?.date || !['absent', 'late'].includes(status)) return null;
      return { studentId: filter.student, courseId: filter.course, scheduleId: filter.schedule || null, date: new Date(filter.date), status };
    })
    .filter(Boolean) as Array<{ studentId: mongoose.Types.ObjectId; courseId: mongoose.Types.ObjectId; scheduleId: mongoose.Types.ObjectId | null; date: Date; status: 'absent' | 'late' }>;
  if (!events.length) return;

  const unique = new Map<string, (typeof events)[number]>();
  for (const event of events) unique.set(`${event.studentId}:${event.courseId}:${event.scheduleId || 'none'}:${event.date.toISOString()}:${event.status}`, event);

  const studentIds = [...new Set([...unique.values()].map((event) => String(event.studentId)))];
  const courseIds = [...new Set([...unique.values()].map((event) => String(event.courseId)))];
  const scheduleIds = [...new Set([...unique.values()].map((event) => event.scheduleId).filter(Boolean).map(String))];
  const [students, courses, schedules] = await Promise.all([
    Student.find({ _id: { $in: studentIds } }).select('studentId parent profile').lean(),
    Course.find({ _id: { $in: courseIds } }).select('title courseCode').lean(),
    scheduleIds.length ? ClassSchedule.find({ _id: { $in: scheduleIds } }).select('startTime endTime').lean() : Promise.resolve([]),
  ]);

  const parentIds = students.map((student: any) => student.parent).filter(Boolean).map(String);
  const profileIds = students.map((student: any) => student.profile).filter(Boolean).map(String);
  const [parents, profiles] = await Promise.all([
    parentIds.length ? Parent.find({ _id: { $in: parentIds } }).select('phone telegramChatId user school').lean() : Promise.resolve([]),
    profileIds.length ? Profile.find({ _id: { $in: profileIds } }).select('firstName lastName').lean() : Promise.resolve([]),
  ]);

  const studentMap = new Map(students.map((student: any) => [String(student._id), student]));
  const courseMap = new Map(courses.map((course: any) => [String(course._id), course]));
  const scheduleMap = new Map((schedules as any[]).map((schedule) => [String(schedule._id), schedule]));
  const parentMap = new Map((parents as any[]).map((parent: any) => [String(parent._id), parent]));
  const profileMap = new Map((profiles as any[]).map((profile: any) => [String(profile._id), profile]));

  await Promise.all([...unique.values()].map(async (event) => {
    try {
      const student: any = studentMap.get(String(event.studentId));
      if (!student?.parent) return;
      const parent: any = parentMap.get(String(student.parent));
      if (!parent) return;

      const course: any = courseMap.get(String(event.courseId));
      const schedule: any = event.scheduleId ? scheduleMap.get(String(event.scheduleId)) : null;
      const profile: any = profileMap.get(String(student.profile));
      const studentName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || student.studentId;
      const courseName = course?.title?.en || course?.courseCode || 'Class';
      const dateText = formatDate(event.date);
      const startTime = schedule?.startTime || '-';
      const endTime = schedule?.endTime || '-';
      const statusText = formatStatus(event.status);
      const body = `Attendance alert: ${studentName} was marked ${statusText} for ${courseName} on ${dateText}${schedule ? ` (${startTime}-${endTime})` : ''}.`;
      const organizationId = String(parent.school || '').trim();
      const baileysReady = whatsappProvider === 'Baileys' && mongoose.isValidObjectId(organizationId);
      const metaReady = whatsappProvider !== 'Baileys' && Boolean(whatsappTemplate);

      const startOfDay = new Date(event.date); startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(event.date); endOfDay.setHours(23, 59, 59, 999);
      const recipient = String(parent.phone || '').trim();

      if (whatsappOn && (baileysReady || metaReady) && recipient) {
        const messageKind = whatsappProvider === 'Baileys' ? 'text' : 'template';
        const duplicate = await WhatsAppMessage.exists({ organization: organizationId, recipient, kind: messageKind, ...(messageKind === 'template' ? { templateName: whatsappTemplate } : {}), body, createdAt: { $gte: startOfDay, $lte: endOfDay } });
        if (!duplicate) {
          const message = await WhatsAppMessage.create({ organization: organizationId, school: parent.school, recipient, parent: parent._id, direction: 'outbound', kind: messageKind, templateName: messageKind === 'template' ? whatsappTemplate : undefined, languageCode: messageKind === 'template' ? languageCode : undefined, body, status: 'queued' });
          try {
            const result = await sendWhatsAppMessage({
              to: recipient,
              text: whatsappProvider === 'Baileys' ? body : undefined,
              templateName: whatsappProvider === 'Baileys' ? undefined : whatsappTemplate,
              languageCode: whatsappProvider === 'Baileys' ? undefined : languageCode,
              components: whatsappProvider === 'Baileys' ? undefined : [{ type: 'body', parameters: [{ type: 'text', text: studentName }, { type: 'text', text: statusText }, { type: 'text', text: courseName }, { type: 'text', text: dateText }, { type: 'text', text: startTime }, { type: 'text', text: endTime }] }],
              organizationId,
            });
            message.status = 'sent'; message.providerMessageId = result.providerMessageId; await message.save();
          } catch (error: any) {
            message.status = 'failed'; message.error = error?.response?.data?.error?.message || error?.message || 'WhatsApp attendance alert failed'; await message.save(); console.error('[WhatsApp attendance] send failed:', message.error);
          }
        }
      }

      const chatId = String(parent.telegramChatId || '').trim();
      if (telegramOn && chatId) {
        const duplicate = await TelegramMessage.exists({ chatId, body, createdAt: { $gte: startOfDay, $lte: endOfDay } });
        if (!duplicate) {
          const message = await TelegramMessage.create({ school: parent.school, chatId, parent: parent._id, body, status: 'queued' });
          try { const result = await sendTelegramMessage(chatId, body); message.status = 'sent'; message.providerMessageId = result.providerMessageId; await message.save(); }
          catch (error: any) { message.status = 'failed'; message.error = error?.response?.data?.description || error?.message || 'Telegram attendance alert failed'; await message.save(); console.error('[Telegram attendance] send failed:', message.error); }
        }
      }
    } catch (error) { console.error('[Attendance notification] automation failed:', error); }
  }));
}

const originalBulkWrite = (Attendance as any).bulkWrite.bind(Attendance);
(Attendance as any).bulkWrite = async function wrappedBulkWrite(ops: AttendanceOp[], ...args: any[]) {
  const result = await originalBulkWrite(ops, ...args);
  void sendForAttendance(ops);
  return result;
};

export default sendForAttendance;
