/**
 * Shared course-category icon/color/label resolution — used anywhere a
 * course card needs to render consistently with Manage Courses (currently
 * courses-manage.tsx and attendance-manage.tsx's "Today's Schedule" quick
 * pick). Single source of truth so the two never drift apart.
 */
import {
  Scale, Landmark, ScrollText, Languages, Mic, BookMarked, Gem, BookOpen, Globe,
  type LucideIcon,
} from 'lucide-react';

export const categoryLabels: Record<string, string> = {
  quran: 'Quran',
  fiqh: 'Fiqh',
  aqeedah: 'Aqeedah',
  seerah: 'Seerah',
  arabic: 'Arabic',
  tajweed: 'Tajweed',
  hadith: 'Hadith',
  akhlaq: 'Akhlaq',
  english: 'English',
  language: 'Language',
};

export const categoryColors: Record<string, string> = {
  quran: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  fiqh: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  aqeedah: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  seerah: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  arabic: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  tajweed: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  hadith: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300',
  akhlaq: 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300',
  english: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  language: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
};

const thumbnailFallbacks: Record<string, LucideIcon> = {
  quran: BookOpen,
  fiqh: Scale,
  aqeedah: Landmark,
  seerah: ScrollText,
  arabic: Languages,
  tajweed: Mic,
  hadith: BookMarked,
  akhlaq: Gem,
  english: Globe,
  language: Globe,
};

/**
 * The 8 built-in categories above always resolve directly. Anything else —
 * a category that doesn't exist yet as a fixed key, e.g. a future "English"/
 * general-language course — is matched by keyword instead of silently
 * falling back to a generic book icon, so a language course reads as a
 * language course rather than looking miscategorized.
 */
export function inferCategoryIcon(category: string): LucideIcon {
  if (thumbnailFallbacks[category]) return thumbnailFallbacks[category];
  const key = category.toLowerCase();
  if (/english|language|lugha|linguist|esl/.test(key)) return Globe;
  if (/arab/.test(key)) return Languages;
  if (/fiqh|law|jurisprudence/.test(key)) return Scale;
  if (/aqeedah|creed|belief/.test(key)) return Landmark;
  if (/seerah|history|biography/.test(key)) return ScrollText;
  if (/tajweed|recit/.test(key)) return Mic;
  if (/hadith|narrat/.test(key)) return BookMarked;
  if (/akhlaq|ethic|character/.test(key)) return Gem;
  return BookOpen;
}

export function inferCategoryColor(category: string): string {
  if (categoryColors[category]) return categoryColors[category];
  const key = category.toLowerCase();
  if (/english|language|lugha|linguist|esl/.test(key)) return categoryColors.english;
  return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
}
