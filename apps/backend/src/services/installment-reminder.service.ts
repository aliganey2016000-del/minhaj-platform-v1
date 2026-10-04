import Invoice from '../models/invoice.model';
import Student from '../models/student.model';
import Parent from '../models/parent.model';
import Notification from '../models/notification.model';
import { notifyUsers } from '../utils/notify';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Sends at most one in-app/push reminder per user and installment per day. */
export async function sendInstallmentReminders(): Promise<number> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 3 * DAY_MS);
  const invoices = await Invoice.find({
    status: { $in: ['pending', 'partial'] },
    'installments.0': { $exists: true },
    'installments.status': { $ne: 'paid' },
    'installments.dueDate': { $lte: horizon },
  }).select('student title installments amount school').lean();

  if (invoices.length === 0) return 0;

  // Batch-load every referenced student and parent up front instead of
  // issuing one findById per invoice (N+1): one $in query each.
  const studentIds = [...new Set((invoices as any[]).map((inv) => String(inv.student)).filter(Boolean))];
  const students = await Student.find({ _id: { $in: studentIds } })
    .select('_id studentId user parent')
    .lean();
  const studentById = new Map(students.map((s) => [String(s._id), s]));

  const parentIds = [...new Set(students.map((s) => (s.parent ? String(s.parent) : null)).filter(Boolean) as string[])];
  const parents = parentIds.length
    ? await Parent.find({ _id: { $in: parentIds } }).select('_id user').lean()
    : [];
  const parentById = new Map(parents.map((p) => [String(p._id), p]));

  // Day bucket for the dedupe key — "at most one reminder per user per
  // installment per day" without scanning message text with a regex.
  const dayKey = now.toISOString().slice(0, 10);

  let sent = 0;
  for (const invoice of invoices as any[]) {
    const student = studentById.get(String(invoice.student));
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
    const recipientIds = [student.user?.toString()].filter(Boolean) as string[];
    if (student.parent) {
      const parent = parentById.get(String(student.parent));
      if (parent?.user) recipientIds.push(parent.user.toString());
    }
    if (!recipientIds.length) continue;
    const uniqueRecipients = [...new Set(recipientIds)];
    const dedupeKey = `installment-reminder:${invoice._id}:${installment.number}:${dayKey}`;
    for (const userId of uniqueRecipients) {
      const alreadySent = await Notification.exists({ user: userId, 'metadata.dedupeKey': dedupeKey });
      if (alreadySent) continue;
      await notifyUsers([userId], { title, message, type: overdue ? 'warning' : 'info', link: '/student/payments', dedupeKey });
      sent++;
    }
  }
  return sent;
}
