import DOMPurify from 'dompurify';

// Shared allowlist for lesson/course rich-text content. Used both when a
// teacher/admin saves content (course-builder.api.ts) and at every place
// that content is later rendered via dangerouslySetInnerHTML — sanitizing
// only on save isn't enough, since content saved before this fix (or by a
// future bypass) would otherwise still be rendered unsanitized.
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
    'input', 'textarea', 'select', 'option', 'label', 'form',
    'iframe',
    'script', 'link', 'meta',
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
    // Interactive elements
    'onclick', 'placeholder', 'disabled', 'checked', 'selected',
    'readonly', 'autoplay', 'controls', 'muted', 'loop',
    'poster', 'playsinline',
    // Misc
    'name', 'value', 'for', 'role', 'aria-label', 'aria-hidden',
    'tabindex', 'contenteditable',
    'frameborder', 'allowfullscreen', 'allow',
    'rel', 'async', 'defer', 'crossorigin', 'integrity', 'referrerpolicy',
    'charset', 'http-equiv', 'content', 'property',
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
  // Allow the <style> tag content to pass through (CSS rules inside style tags)
  ALLOW_DATA_ATTR: false,
};

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty || '', RICH_TEXT_CONFIG);
}
