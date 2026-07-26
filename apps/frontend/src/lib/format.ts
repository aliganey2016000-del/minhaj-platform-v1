/** Normalizes free-typed titles ("FINAL EXAM", "mid exam", "final") to one consistent Title Case ("Final Exam") for display, without touching the stored value. Arabic/Somali script has no case, so it passes through unchanged. */
export function toTitleCase(str: string): string {
  if (!str) return str;
  return str.replace(/[A-Za-z]\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}
