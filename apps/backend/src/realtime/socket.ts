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

let io: SocketIOServer | null = null;

// userId -> number of currently-open sockets (tabs/devices) for that user.
const connectionCounts = new Map<string, number>();

const PRESENCE_ROOM = 'presence:watchers';

function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function initSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
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
