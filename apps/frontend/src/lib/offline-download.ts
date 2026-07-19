/**
 * Offline Download — collects a course's lesson content + self-hosted video
 * URLs and stores them for offline use: the structured content goes into
 * IndexedDB (offline-store.ts), and each video URL is fetched once to warm
 * the service worker's CacheFirst `offline-video-cache` (vite.config.ts).
 *
 * YouTube/Vimeo embedded videos can't be downloaded — they need a live
 * connection to their own player regardless of caching.
 */

import { saveDownloadedCourse, removeDownloadedCourse } from './offline-store';

function isDirectVideoUrl(url?: string): boolean {
  return !!url && /\.(mp4|webm|ogg|mov|mkv|avi)(\?.*)?$/i.test(url);
}

/** Walks chapters/items and collects every direct-hosted lesson video URL. */
function collectVideoUrls(content: any): string[] {
  const urls: string[] = [];
  for (const chapter of content?.chapters || []) {
    for (const item of chapter.items || []) {
      if (item.type !== 'lesson') continue;
      if (isDirectVideoUrl(item.videoUrl)) urls.push(item.videoUrl);
    }
  }
  return [...new Set(urls)];
}

export interface DownloadProgress {
  phase: 'saving' | 'videos';
  completed: number;
  total: number;
}

export async function downloadCourseForOffline(
  courseId: string,
  course: any,
  content: any,
  onProgress?: (p: DownloadProgress) => void
): Promise<void> {
  const videoUrls = collectVideoUrls(content);

  onProgress?.({ phase: 'saving', completed: 0, total: 1 });
  await saveDownloadedCourse({ courseId, downloadedAt: Date.now(), course, content, videoUrls });
  onProgress?.({ phase: 'saving', completed: 1, total: 1 });

  // Warm the video cache — best-effort per file, one failure shouldn't abort the rest.
  for (let i = 0; i < videoUrls.length; i++) {
    try {
      await fetch(videoUrls[i], { mode: 'cors' });
    } catch {
      // Video host may not allow cross-origin fetch, or the network dropped —
      // the course text/structure is still saved either way.
    }
    onProgress?.({ phase: 'videos', completed: i + 1, total: videoUrls.length });
  }
}

export async function removeOfflineCourse(courseId: string): Promise<void> {
  await removeDownloadedCourse(courseId);
}
