// Hebrew, Arabic, Arabic Supplement, Arabic Extended-A, and Arabic
// Presentation Forms A/B — covers Quranic/Islamic-studies text and Hebrew.
// Built via `new RegExp` from explicit \u escapes (not a literal character
// class) so the ranges stay unambiguous regardless of file/editor encoding.
const RTL_CHAR_REGEX = new RegExp(
  '[\\u0591-\\u05F4\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]'
);
const LTR_CHAR_REGEX = /[A-Za-z]/;

/**
 * Best-effort RTL/LTR detection for lesson content that has no explicit
 * `dir` attribute set by the author (most bulk-imported or plain-typed
 * Arabic/Somali lesson text never gets one). Strips tags, then counts
 * RTL-script characters against Latin letters in the remaining plain text
 * and returns whichever script dominates — used to pick a sensible default
 * container direction/alignment. Any element with its own explicit `dir=`
 * (e.g. set via the lesson editor's per-paragraph direction toggle) still
 * wins locally, since this only sets the container's default.
 */
export function detectTextDirection(html: string): 'rtl' | 'ltr' {
  const text = (html || '').replace(/<[^>]+>/g, ' ');
  let rtl = 0;
  let ltr = 0;
  for (const ch of text) {
    if (RTL_CHAR_REGEX.test(ch)) rtl++;
    else if (LTR_CHAR_REGEX.test(ch)) ltr++;
  }
  return rtl > ltr ? 'rtl' : 'ltr';
}
