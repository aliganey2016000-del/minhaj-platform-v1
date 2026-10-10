/**
 * Unified notification dispatch — the single place that fans a notification
 * out to all three channels: persisted Notification doc (so it shows up in
 * the in-app bell/list even if the user was offline), a live Socket.IO event
 * (instant update while the app is open), and a Web Push notification
 * (delivered even if the tab/app is closed, best-effort).
 */

import Notification from '../models/notification.model';
import { emitToUser } from '../realtime/socket';
import { sendPushToUser } from './web-push';
import { mapLimit } from './map-limit';

interface NotifyInput {
  userId: string;
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  link?: string;
  // Stable key recurring jobs can use to avoid sending the same
  // notification twice (see Notification model's `metadata.dedupeKey`).
  dedupeKey?: string;
}

export async function notifyUser({ userId, title, message, type = 'info', link = '', dedupeKey }: NotifyInput) {
  const notification = await Notification.create({
    user: userId,
    title,
    message,
    type,
    link,
    ...(dedupeKey ? { metadata: { dedupeKey } } : {}),
  });

  emitToUser(userId, 'notification:new', {
    _id: notification._id,
    title,
    message,
    type,
    link,
    read: false,
    createdAt: notification.createdAt,
  });

  // Fire-and-forget — a failed push must never block the request that
  // triggered the notification (e.g. creating an assignment).
  sendPushToUser(userId, { title, message, link }).catch(() => {});

  return notification;
}

/** Same as notifyUser but for a batch of recipients (e.g. every student enrolled in a course). */
export async function notifyUsers(userIds: string[], data: Omit<NotifyInput, 'userId'>) {
  // Bounded: notifying a whole school must not open thousands of simultaneous writes.
  await mapLimit(userIds, 25, (userId) => notifyUser({ ...data, userId }));
}
