import { queueWhatsAppNotification } from './whatsapp-notification.service';

export async function queueAttendanceAlert(input: {
  organizationId: string;
  parentId: string;
  studentName: string;
  status: 'absent' | 'late';
  date: string;
  details?: string;
}) {
  const label = input.status === 'absent' ? 'Absent' : 'Late';
  return queueWhatsAppNotification({
    organizationId: input.organizationId,
    parentId: input.parentId,
    category: 'attendance',
    eventType: `attendance.${input.status}`,
    idempotencyKey: `attendance:${input.organizationId}:${input.parentId}:${input.date}:${input.status}:${input.studentName}`,
    payload: {
      text: `Minhaj Platform\nAttendance Alert\nStudent: ${input.studentName}\nStatus: ${label}\nDate: ${input.date}${input.details ? `\nDetails: ${input.details}` : ''}`,
    },
  });
}

export async function queueFeeReminder(input: { organizationId: string; parentId: string; invoiceId: string; studentName: string; amount: string; dueDate?: string }) {
  return queueWhatsAppNotification({
    organizationId: input.organizationId,
    parentId: input.parentId,
    category: 'fees',
    eventType: 'fees.reminder',
    idempotencyKey: `fees:${input.organizationId}:${input.invoiceId}`,
    payload: { text: `Minhaj Platform\nFee Reminder\nStudent: ${input.studentName}\nAmount: ${input.amount}${input.dueDate ? `\nDue: ${input.dueDate}` : ''}` },
  });
}

export async function queueResultNotification(input: { organizationId: string; parentId: string; resultId: string; studentName: string; summary: string }) {
  return queueWhatsAppNotification({
    organizationId: input.organizationId,
    parentId: input.parentId,
    category: 'results',
    eventType: 'results.published',
    idempotencyKey: `results:${input.organizationId}:${input.resultId}`,
    payload: { text: `Minhaj Platform\nResult Published\nStudent: ${input.studentName}\n${input.summary}` },
  });
}

export async function queueAnnouncementNotification(input: { organizationId: string; parentId: string; announcementId: string; title: string; body: string }) {
  return queueWhatsAppNotification({
    organizationId: input.organizationId,
    parentId: input.parentId,
    category: 'announcements',
    eventType: 'announcements.published',
    idempotencyKey: `announcement:${input.organizationId}:${input.announcementId}:${input.parentId}`,
    payload: { text: `Minhaj Platform\n${input.title}\n\n${input.body}` },
  });
}
