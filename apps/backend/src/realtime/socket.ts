/**
 * Realtime layer (Socket.IO) — a thin authenticated pub/sub on top of the
 * existing HTTP API. Every connected client joins a room named after their
 * own userId, so server code anywhere can push an event to a specific user
 * without tracking socket ids. Single-process only (no Redis adapter) —
 * matches the rest of this app's single-instance deployment.
 *
 * Also drives student online/offline presence for the Activity Tracking
 * dashboard: an in-memory connection count per user (a student can have
 * several tabs/devices open) plus `User.lastSeenAt`, so "online now" is
 * derived rather than a separately-maintained boolean that could drift.
 * Admin/teacher clients that join `presence:watchers` get live push
 * updates; anyone else just gets the connection tracked silently.
 */

import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';
import User from '../models/user.model';
import { getAllowedOrigins } from '../utils/cors-origins';
import { canUserViewStudent } from '../utils/student-visibility';

let io: SocketIOServer | null = null;

// userId -> number of currently-open sockets (tabs/devices) for that user.
const connectionCounts = new Map<string, number>();

const PRESENCE_ROOM = 'presence:watchers';

function userRoom(userId: string): string {
  return `user:${userId}`;
}

// One room per watched student rather than a single firehose: a teacher may
// only see their own students, so authorization is checked once at join time
// and the room membership enforces it from then on.
function activityRoom(studentId: string): string {
  return `activity:student:${studentId}`;
}

export function initSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: getAllowedOrigins(),
      credentials: true,
    },
  });

  io.use((socket: Socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) throw new Error('Missing token');
      const decoded = verifyAccessToken(token);
      (socket.data as any).userId = decoded.userId;
      (socket.data as any).role = decoded.role;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket.data as any).userId as string;
    const role = (socket.data as any).role as string | undefined;
    socket.join(userRoom(userId));

    const wasOffline = (connectionCounts.get(userId) || 0) === 0;
    connectionCounts.set(userId, (connectionCounts.get(userId) || 0) + 1);
    const now = new Date();
    void User.updateOne({ _id: userId }, { lastSeenAt: now }).catch(() => {});
    if (wasOffline) {
      io?.to(PRESENCE_ROOM).emit('presence:update', { userId, online: true, lastSeenAt: now.toISOString() });
    }

    // Admin/teacher clients watching the Activity dashboard subscribe here.
    socket.on('presence:watch', () => {
      if (role === 'admin' || role === 'teacher' || role === 'org_admin') {
        socket.join(PRESENCE_ROOM);
      }
    });

    // Live feed for one student's Activity Events view. The client sends the
    // student it currently has open; the server re-checks that this user is
    // allowed to see them before joining, so a forged studentId gets nothing.
    socket.on('activity:watch', async (studentId: unknown) => {
      if (typeof studentId !== 'string' || !studentId) return;
      try {
        if (!(await canUserViewStudent(userId, role, studentId))) return;
        socket.join(activityRoom(studentId));
        socket.emit('activity:watching', { studentId });
      } catch {
        // A failed lookup simply means no live feed; the page still polls.
      }
    });

    socket.on('activity:unwatch', (studentId: unknown) => {
      if (typeof studentId === 'string' && studentId) socket.leave(activityRoom(studentId));
    });

    socket.on('disconnect', () => {
      const remaining = Math.max(0, (connectionCounts.get(userId) || 1) - 1);
      if (remaining === 0) {
        connectionCounts.delete(userId);
        const seenAt = new Date();
        void User.updateOne({ _id: userId }, { lastSeenAt: seenAt }).catch(() => {});
        io?.to(PRESENCE_ROOM).emit('presence:update', { userId, online: false, lastSeenAt: seenAt.toISOString() });
      } else {
        connectionCounts.set(userId, remaining);
      }
    });
  });

  return io;
}

/** Emit an event to every connected socket for a given user. No-op if that user is offline or the server has no socket layer (e.g. tests). */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(userRoom(userId)).emit(event, payload);
}

/**
 * Push a live update to the admins/teachers currently watching one student's
 * Activity Events view. No-op when nobody is watching, which is the normal
 * case — callers should still gate any extra work behind hasActivityWatchers.
 */
export function emitToStudentWatchers(studentId: string, event: string, payload: unknown): void {
  io?.to(activityRoom(studentId)).emit(event, payload);
}

/** True when at least one admin/teacher has this student's activity view open. */
export function hasActivityWatchers(studentId: string): boolean {
  const room = io?.sockets.adapter.rooms.get(activityRoom(studentId));
  return Boolean(room && room.size > 0);
}

/** True if the given user currently has at least one open socket connection. */
export function isUserOnline(userId: string): boolean {
  return (connectionCounts.get(userId) || 0) > 0;
}

/** All userIds with at least one open socket connection right now. */
export function getOnlineUserIds(): string[] {
  return [...connectionCounts.keys()];
}

export function getIO(): SocketIOServer | null {
  return io;
}
