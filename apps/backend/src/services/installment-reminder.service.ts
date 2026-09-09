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

  let sent = 0;
  for (const invoice of invoices as any[]) {
    const student = await Student.findById(invoice.student).select('studentId user parent').lean();
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
      const parent = await Parent.findById(student.parent).select('user').lean();
      if (parent?.user) recipientIds.push(parent.user.toString());
    }
    if (!recipientIds.length) continue;
    const uniqueRecipients = [...new Set(recipientIds)];
    for (const userId of uniqueRecipients) {
      const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
      const alreadySent = await Notification.exists({ user: userId, title, link: '/student/payments', createdAt: { $gte: startOfDay }, message: { $regex: `Part ${installment.number}` } });
      if (alreadySent) continue;
      await notifyUsers([userId], { title, message, type: overdue ? 'warning' : 'info', link: '/student/payments' });
      sent++;
    }
  }
  return sent;
}