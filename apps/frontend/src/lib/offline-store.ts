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
const DB_VERSION = 4;

const STORE_COURSES = 'downloadedCourses';
const STORE_QUEUE = 'pendingActions';
const STORE_GATE = 'gateProgress';
const STORE_OFFLINE_DATA = 'offlineData';
const STORE_QUIZ_PROGRESS = 'quizProgress';

export interface DownloadedCourse {
  courseId: string;
  downloadedAt: number;
  course: any;
  content: any;
  videoUrls: string[];
}

export type PendingActionType =
  | 'mark-complete'
  | 'gamification-lesson'
  | 'gamification-quiz'
  | 'gamification-streak'
  | 'gate-block-answer'
  | 'gate-checkpoint-answer'
  | 'gate-video-progress'
  | 'quiz-submit-attempt';

export interface PendingAction {
  id?: number;
  type: PendingActionType;
  url: string;
  body: Record<string, unknown>;
  createdAt: number;
  dedupeKey?: string;
}

export interface GateProgress {
  lessonId: string;
  courseId: string;
  unlockedBlockIndex: number;
  gateCompleted: boolean;
  maxTimeWatched: number;
  clearedCheckpoints: number[];
  updatedAt: number;
}

/**
 * A student's in-progress answers for a quiz they haven't submitted yet —
 * autosaved on every answer change so a reload or network drop mid-quiz
 * never loses work. Cleared once the attempt is actually submitted.
 */
export interface QuizProgress {
  quizId: string; // keyPath
  courseId: string;
  answers: Record<number, unknown>;
  currentQuestion: number;
  flagged: number[];
  startedAt: number;
  updatedAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains(STORE_COURSES)) {
          db.createObjectStore(STORE_COURSES, { keyPath: 'courseId' });
        }
        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          db.createObjectStore(STORE_QUEUE, { keyPath: 'id', autoIncrement: true });
        }
        if (oldVersion < 2 && !db.objectStoreNames.contains(STORE_GATE)) {
          db.createObjectStore(STORE_GATE, { keyPath: 'lessonId' });
        }
        if (oldVersion < 3 && !db.objectStoreNames.contains(STORE_OFFLINE_DATA)) {
          db.createObjectStore(STORE_OFFLINE_DATA, { keyPath: 'key' });
        }
        if (oldVersion < 4 && !db.objectStoreNames.contains(STORE_QUIZ_PROGRESS)) {
          db.createObjectStore(STORE_QUIZ_PROGRESS, { keyPath: 'quizId' });
        }
      },
    });
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// Generic offline data cache (key-value store for teacher portal offline use)
// ---------------------------------------------------------------------------

export async function saveOfflineData(key: string, value: any): Promise<void> {
  const db = await getDb();
  await db.put(STORE_OFFLINE_DATA, { key, value, updatedAt: Date.now() });
}

export async function getOfflineData<T = any>(key: string): Promise<T | undefined> {
  const db = await getDb();
  const record = await db.get(STORE_OFFLINE_DATA, key);
  return record?.value;
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
// Pending action queue
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

export async function queueVideoProgress(lessonId: string, url: string, currentTime: number): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORE_QUEUE, 'readwrite');
  const all = await tx.store.getAll();
  const stale = all.find((a) => a.type === 'gate-video-progress' && a.dedupeKey === lessonId);
  if (stale) await tx.store.delete(stale.id);
  await tx.store.add({
    type: 'gate-video-progress',
    url,
    body: { currentTime },
    dedupeKey: lessonId,
    createdAt: Date.now(),
  });
  await tx.done;
}

// ---------------------------------------------------------------------------
// Interactive Gate progress
// ---------------------------------------------------------------------------

export async function getGateProgress(lessonId: string): Promise<GateProgress | undefined> {
  const db = await getDb();
  return db.get(STORE_GATE, lessonId);
}

export async function saveGateProgress(progress: GateProgress): Promise<void> {
  const db = await getDb();
  await db.put(STORE_GATE, progress);
}

// ---------------------------------------------------------------------------
// In-progress quiz answers (autosave)
// ---------------------------------------------------------------------------

export async function getQuizProgress(quizId: string): Promise<QuizProgress | undefined> {
  const db = await getDb();
  return db.get(STORE_QUIZ_PROGRESS, quizId);
}

export async function saveQuizProgress(progress: QuizProgress): Promise<void> {
  const db = await getDb();
  await db.put(STORE_QUIZ_PROGRESS, progress);
}

export async function clearQuizProgress(quizId: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_QUIZ_PROGRESS, quizId);
}

export async function patchGateProgress(
  lessonId: string,
  courseId: string,
  partial: Partial<Omit<GateProgress, 'lessonId' | 'courseId' | 'updatedAt'>>
): Promise<GateProgress> {
  const existing = await getGateProgress(lessonId);
  const merged: GateProgress = {
    lessonId,
    courseId,
    unlockedBlockIndex: existing?.unlockedBlockIndex ?? 0,
    gateCompleted: existing?.gateCompleted ?? false,
    maxTimeWatched: existing?.maxTimeWatched ?? 0,
    clearedCheckpoints: existing?.clearedCheckpoints ?? [],
    ...partial,
    updatedAt: Date.now(),
  };
  await saveGateProgress(merged);
  return merged;
}