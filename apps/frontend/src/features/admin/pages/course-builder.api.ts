/**
 * Course Content Builder — API Hooks
 *
 * Provides data fetching + mutations for the CourseContent resource.
 * Uses React state + effects pattern (matching existing codebase) rather
 * than TanStack Query, since TanStack isn't installed.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../../lib/axios';
import type { CourseContent, Chapter } from './course-builder.types';

// ---------------------------------------------------------------------------
// Helper: generate a temporary MongoDB-style ObjectId for optimistic UI
//
// Mirrors ObjectId's own layout (4-byte timestamp + 5 random bytes + 3-byte
// counter) instead of a plain incrementing counter — a simple counter resets
// to 0 on every page load/HMR reload, so two items created in different
// sessions (or a chapter item and one of its own content blocks generated
// moments apart across a reload) could end up with the identical id "...001".
// Since chapters/items are Schema.Types.Mixed, Mongoose never replaces these
// client-generated ids with real ObjectIds, so collisions persist forever.
// ---------------------------------------------------------------------------
let idCounter = Math.floor(Math.random() * 0xffffff);
export function generateTempId(): string {
  const timestamp = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  const random = Math.floor(Math.random() * 0xffffffffff).toString(16).padStart(10, '0');
  idCounter = (idCounter + 1) % 0xffffff;
  const counter = idCounter.toString(16).padStart(6, '0');
  return `${timestamp}${random}${counter}`;
}

// ---------------------------------------------------------------------------
// useCourseContent — Fetch + Save course content
// ---------------------------------------------------------------------------
export function useCourseContent(courseId: string) {
  const [content, setContent] = useState<CourseContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const contentRef = useRef<CourseContent | null>(null);

  // Keep ref in sync for autosave
  contentRef.current = content;

  // Fetch content
  const fetchContent = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/courses/${courseId}/content`);
      const fetched = data.data as CourseContent;
      // Ensure _id fields are strings
      const normalized = normalizeContent(fetched);
      setContent(normalized);
      setLastSaved(normalized.lastSaved || null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load course content');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  // Save content (full upsert)
  const saveContent = useCallback(async (contentToSave?: CourseContent) => {
    const payload = contentToSave || contentRef.current;
    if (!payload) return;
    setSaving(true);
    try {
      const { data } = await api.put(`/courses/${courseId}/content`, {
        chapters: payload.chapters.map((ch) => sanitizeChapter(ch)),
      });
      const saved = normalizeContent(data.data as CourseContent);
      setContent(saved);
      setLastSaved(saved.lastSaved || null);
      return saved;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save');
      throw err;
    } finally {
      setSaving(false);
    }
  }, [courseId]);

  // Reorder chapters
  const reorderChapters = useCallback(async (chapterIds: string[]) => {
    try {
      const { data } = await api.patch(`/courses/${courseId}/content/chapters/reorder`, {
        chapterIds,
      });
      const updated = normalizeContent(data.data as CourseContent);
      setContent(updated);
      setLastSaved(updated.lastSaved || null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to reorder chapters');
    }
  }, [courseId]);

  // Reorder items within a chapter
  const reorderItems = useCallback(async (chapterId: string, itemIds: string[]) => {
    try {
      const { data } = await api.patch(
        `/courses/${courseId}/content/chapters/${chapterId}/items/reorder`,
        { itemIds },
      );
      const updated = normalizeContent(data.data as CourseContent);
      setContent(updated);
      setLastSaved(updated.lastSaved || null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to reorder items');
    }
  }, [courseId]);

  // Toggle chapter collapse (persisted to server)
  const toggleChapterCollapse = useCallback(async (chapterId: string) => {
    // Optimistic update
    setContent((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        chapters: prev.chapters.map((ch) =>
          ch._id === chapterId ? { ...ch, collapsed: !ch.collapsed } : ch,
        ),
      };
    });
    try {
      const { data } = await api.patch(
        `/courses/${courseId}/content/chapters/${chapterId}/collapse`,
      );
      const updated = normalizeContent(data.data as CourseContent);
      setContent(updated);
    } catch (err: any) {
      // Revert on failure — refetch
      fetchContent();
    }
  }, [courseId, fetchContent]);

  // Optimistic update helper — updates content locally without saving to server
  const updateContentLocally = useCallback((updater: (prev: CourseContent) => CourseContent) => {
    setContent((prev) => {
      if (!prev) return prev;
      return updater(prev);
    });
  }, []);

  return {
    content,
    loading,
    saving,
    error,
    lastSaved,
    fetchContent,
    saveContent,
    reorderChapters,
    reorderItems,
    toggleChapterCollapse,
    updateContentLocally,
    setContent,
  };
}

// ---------------------------------------------------------------------------
// Auto-save hook — debounced save
// ---------------------------------------------------------------------------
export function useAutoSave(
  saveFn: () => Promise<any>,
  content: CourseContent | null,
  delayMs = 3000,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);
  const lastContentJson = useRef('');

  useEffect(() => {
    if (!content) return;
    const currentJson = JSON.stringify(content.chapters);
    if (currentJson === lastContentJson.current) return;

    lastContentJson.current = currentJson;
    isDirtyRef.current = true;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (isDirtyRef.current) {
        try {
          await saveFn();
          isDirtyRef.current = false;
        } catch {
          // Retry on next change
        }
      }
    }, delayMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [content, saveFn, delayMs]);

  // Force immediate save
  const saveNow = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      await saveFn();
      isDirtyRef.current = false;
    } catch {
      // ignore
    }
  }, [saveFn]);

  return { saveNow };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Ensure all _id are strings for consistent comparison */
function normalizeContent(content: CourseContent): CourseContent {
  return {
    ...content,
    course: typeof content.course === 'string' ? content.course : String(content.course),
    chapters: (content.chapters || []).map((ch: any) => ({
      ...ch,
      _id: String(ch._id || generateTempId()),
      items: (ch.items || []).map((item: any) => ({
        ...item,
        _id: String(item._id || generateTempId()),
      })),
    })),
  };
}

/** Remove UI-only fields before sending to server */
function sanitizeChapter(chapter: Chapter): any {
  const { _isNew, _isEditing, ...rest } = chapter as any;
  return {
    ...rest,
    items: chapter.items.map((item: any) => {
      const { _isNew: n, _isEditing: e, ...clean } = item;
      return clean;
    }),
  };
}