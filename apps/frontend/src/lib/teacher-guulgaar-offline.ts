/** Device-local, account-scoped snapshots for the teacher Guulgaar portal. */
import { getOfflineData, saveOfflineData } from './offline-store';

function cacheKey(userId: string, section: string): string {
  return `teacher-guulgaar:v1:${encodeURIComponent(window.location.hostname)}:${encodeURIComponent(userId)}:${section}`;
}

export async function saveTeacherGuulgaarSnapshot(userId: string, section: string, value: unknown): Promise<void> {
  if (!userId || typeof window === 'undefined') return;
  await saveOfflineData(cacheKey(userId, section), { value, savedAt: Date.now() });
}

export async function getTeacherGuulgaarSnapshot<T>(userId: string, section: string): Promise<{ value: T; savedAt: number } | undefined> {
  if (!userId || typeof window === 'undefined') return undefined;
  const record = await getOfflineData<{ value: T; savedAt: number }>(cacheKey(userId, section));
  return record && record.value !== undefined ? record : undefined;
}
