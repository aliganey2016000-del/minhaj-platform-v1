/** Normalizes free-typed titles ("FINAL EXAM", "mid exam", "final") to one consistent Title Case ("Final Exam") for display, without touching the stored value. Arabic/Somali script has no case, so it passes through unchanged. */
export function toTitleCase(str: string): string {
  if (!str) return str;
  return str.replace(/[A-Za-z]\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

/**
 * Triggers a browser download for a Blob response. The app's auth token is
 * sent via an Authorization header (src/lib/axios.ts), not a cookie, so a
 * plain `<a href>` to an API endpoint can't authenticate — the caller must
 * fetch the file with axios first (responseType: 'blob') and hand it to
 * this helper to actually save it.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
