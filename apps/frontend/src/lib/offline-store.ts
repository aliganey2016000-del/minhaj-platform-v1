/**
 * Offline Store — IndexedDB-backed storage for downloaded courses and a
 * queue of actions taken while offline (progress/gamification calls),
 * replayed once the connection comes back.
 *
 * Binary media (self-hosted lesson videos) isn't stored here — it's served
 * through the service worker's `offline-video-cache` (see vite.config.ts),
 * which is warmed by a plain `fetch()` per video URL during download.
 */

import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'sahal-offline';
const DB_VERSION = 1;

const STORE_COURSES = 'downloadedCourses';
const STORE_QUEUE = 'pendingActions';

export interface DownloadedCourse {
  courseId: string;
  downloadedAt: number;
  course: any; // EnrolledCourse shape, as returned by /students/my/courses
  content: any; // CourseContent shape, as returned by /courses/:id/content
  videoUrls: string[]; // direct-hosted video URLs warmed into the SW cache
}

export type PendingActionType = 'mark-complete' | 'gamification-lesson' | 'gamification-quiz' | 'gamification-streak';

export interface PendingAction {
  id?: number;
  type: PendingActionType;
  url: string;
  body: Record<string, unknown>;
  createdAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_COURSES)) {
          db.createObjectStore(STORE_COURSES, { keyPath: 'courseId' });
        }
        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          db.createObjectStore(STORE_QUEUE, { keyPath: 'id', autoIncrement: true });
        }
      },
    });
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// Downloaded courses
// ---------------------------------------------------------------------------

export async function saveDownloadedCourse(data: DownloadedCourse): Promise<void> {
  const db = await getDb();
  await db.put(STORE_COURSES, data);
}

export async function getDownloadedCourse(courseId: string): Promise<DownloadedCourse | undefined> {
  const db = await getDb();
  return db.get(STORE_COURSES, courseId);
}

export async function isDownloaded(courseId: string): Promise<boolean> {
  return (await getDownloadedCourse(courseId)) !== undefined;
}

export async function removeDownloadedCourse(courseId: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_COURSES, courseId);
}

export async function listDownloadedCourseIds(): Promise<string[]> {
  const db = await getDb();
  const keys = await db.getAllKeys(STORE_COURSES);
  return keys as string[];
}

// ---------------------------------------------------------------------------
// Pending action queue — actions taken while offline, replayed on reconnect
// ---------------------------------------------------------------------------

export async function queueAction(action: Omit<PendingAction, 'id' | 'createdAt'>): Promise<void> {
  const db = await getDb();
  await db.add(STORE_QUEUE, { ...action, createdAt: Date.now() });
}

export async function getQueuedActions(): Promise<PendingAction[]> {
  const db = await getDb();
  return db.getAll(STORE_QUEUE);
}

export async function removeQueuedAction(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_QUEUE, id);
}
