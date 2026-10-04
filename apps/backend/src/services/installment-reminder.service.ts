import Invoice from '../models/invoice.model';
import Student from '../models/student.model';
import Parent from '../models/parent.model';
import Notification from '../models/notification.model';
import { notifyUsers } from '../utils/notify';

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 200;

/**
 * Sends at most one in-app/push reminder per user and installment per day.
 *
 * Invoices are streamed in batches and each batch's students, parents and
 * already-sent reminders are fetched with one query each. The previous
 * version loaded every school's invoices at once and issued several queries
 * per invoice, which grows with the whole platform on every daily run (and on
 * every restart, since it also runs at startup).
 */
export async function sendInstallmentReminders(): Promise<number> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 3 * DAY_MS);
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);

  const cursor = Invoice.find({
    status: { $in: ['pending', 'partial'] },
    'installments.0': { $exists: true },
    'installments.status': { $ne: 'paid' },
    'installments.dueDate': { $lte: horizon },
  }).select('student title installments amount school').lean().cursor({ batchSize: BATCH_SIZE });

  let sent = 0;
  let batch: any[] = [];
  const flush = async () => {
    if (!batch.length) return;
    sent += await remindBatch(batch, now, horizon, startOfDay);
    batch = [];
  };

  for await (const invoice of cursor) {
    batch.push(invoice);
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();
  return sent;
}

async function remindBatch(invoices: any[], now: Date, horizon: Date, startOfDay: Date): Promise<number> {
  const students = await Student.find({ _id: { $in: invoices.map((invoice) => invoice.student) } })
    .select('studentId user parent').lean();
  const studentById = new Map((students as any[]).map((student) => [String(student._id), student]));

  const parentIds = (students as any[]).map((student) => student.parent).filter(Boolean);
  const parents = parentIds.length ? await Parent.find({ _id: { $in: parentIds } }).select('user').lean() : [];
  const parentUserById = new Map((parents as any[]).map((parent) => [String(parent._id), parent.user ? String(parent.user) : '']));

  type Reminder = { userId: string; title: string; message: string; overdue: boolean; part: number };
  const reminders: Reminder[] = [];
  for (const invoice of invoices) {
    const student: any = studentById.get(String(invoice.student));
    if (!student) continue;
    const installment = (invoice.installments || [])
      .filter((item: any) => item.status !== 'paid' && new Date(item.dueDate) <= horizon)
      .sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
    if (!installment) continue;

    const due = new Date(installment.dueDate);
    const overdue = due < now;
    const remaining = Math.max(0, Number(installment.amount || 0) - Number(installment.paidAmount || 0));
    const title = overdue ? 'Installment overdue' : 'Installment payment reminder';
    const message = overdue
      ? `Part ${installment.number} of "${invoice.title}" is overdue. Remaining: ${remaining.toLocaleString()}.`
      : `Part ${installment.number} of "${invoice.title}" is due ${due.toLocaleDateString()}. Amount remaining: ${remaining.toLocaleString()}.`;
    const recipientIds = [student.user ? String(student.user) : '', student.parent ? parentUserById.get(String(student.parent)) || '' : '']
      .filter(Boolean);
    for (const userId of new Set(recipientIds)) {
      reminders.push({ userId, title, message, overdue, part: Number(installment.number) });
    }
  }
  if (!reminders.length) return 0;

  const todays = await Notification.find({
    user: { $in: [...new Set(reminders.map((reminder) => reminder.userId))] },
    link: '/student/payments',
    createdAt: { $gte: startOfDay },
  }).select('user title message').lean();
  const alreadySent = new Set<string>();
  for (const notification of todays as any[]) {
    const part = String(notification.message || '').match(/^Part (\d+)/)?.[1];
    if (part) alreadySent.add(`${notification.user}|${notification.title}|${part}`);
  }

  let sent = 0;
  for (const reminder of reminders) {
    const key = `${reminder.userId}|${reminder.title}|${reminder.part}`;
    if (alreadySent.has(key)) continue;
    alreadySent.add(key);
    await notifyUsers([reminder.userId], {
      title: reminder.title,
      message: reminder.message,
      type: reminder.overdue ? 'warning' : 'info',
      link: '/student/payments',
    });
    sent++;
  }
  return sent;
}
