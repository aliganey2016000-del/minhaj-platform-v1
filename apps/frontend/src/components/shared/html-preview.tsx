/**
 * HtmlPreview — Renders sanitized lesson HTML inside a sandboxed <iframe>
 * via srcDoc, completely isolating the lesson's CSS, JS, and fonts from
 * the host page's Tailwind / admin dashboard styles.
 *
 * Two content formats are supported transparently:
 *
 * 1. Full HTML documents — starts with <!DOCTYPE html> or <html>.
 *    Passed into srcDoc as-is so the author's <style>, <link>, and
 *    <script> elements work exactly as they would in a real browser tab.
 *
 * 2. Inline-style fragments — plain <div style="..."> markup with no
 *    <html> wrapper. Automatically wrapped in a minimal HTML5 shell with
 *    light/dark-aware base styles so they look native without needing
 *    the author to write their own <head>.
 *
 * The <iframe> uses sandbox="allow-scripts" (NOT allow-same-origin) so
 * interactive JavaScript (matching exercises, audio buttons, progress
 * bars, quizzes) runs safely without any access to the parent page's
 * cookies, session data, or DOM.
 */

import { useRef, useState, useMemo, useCallback } from 'react';
import { sanitizeHtml } from '../../lib/sanitize-html';

// ---------------------------------------------------------------------------
// Detection helpers
// ---------------------------------------------------------------------------

/** True when the HTML starts with <!DOCTYPE html>, <html>, or <head>. */
function isFullDocument(html: string): boolean {
  return /^\s*(<!DOCTYPE\s+html|<html\b|<head\b)/i.test(html.trim());
}

/**
 * True when content uses <script> tags and therefore MUST be rendered
 * in an iframe (scripts can't run inside a plain <div> with
 * dangerouslySetInnerHTML).
 */
export function hasScripts(html: string): boolean {
  return /<script\b[^>]*>/i.test(html);
}

// ---------------------------------------------------------------------------
// Document builders
// ---------------------------------------------------------------------------

/**
 * For inline-style fragments: wraps the content in a minimal HTML5 shell
 * with base resets and light/dark mode support via CSS custom properties.
 * The author's own <style> blocks (if any) will override these base rules.
 */
function buildShellForFragment(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    /* Base reset. The lesson's own <style> blocks / CSS classes override
       these rules. Light & dark variants respond to prefers-color-scheme
       so the iframe feels native without any Tailwind leakage. */
    :root { color-scheme: light; }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.7;
      color: #0f172a;
      background: #ffffff;
    }
    ${'@media (prefers-color-scheme: dark) {'}
      body {
        color: #f1f5f9;
        background: #0f172a;
      }
    ${'}'}
    h1, h2, h3, h4, h5, h6 { margin: 0 0 0.5em 0; }
    p { margin: 0 0 0.75em 0; line-height: 1.65; }
    ul, ol { padding-left: 1.25rem; margin: 0 0 0.75em 0; }
    li { font-size: 0.875rem; }
    a { color: #2563eb; text-decoration: underline; }
    img { border-radius: 0.75rem; max-width: 100%; }
    table { width: 100%; border-collapse: collapse; }
    td, th { border: 1px solid #e2e8f0; padding: 0.5rem; }
    pre, code {
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 0.75rem;
      background: #f1f5f9;
      border-radius: 0.375rem;
      padding: 0.125rem 0.375rem;
    }
    pre { padding: 1rem; overflow-x: auto; margin-bottom: 0.75rem; }
    [dir="rtl"] { text-align: right; line-height: 1.9; }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

/**
 * For full HTML documents: pass through as-is after DOMPurify sanitization.
 * The document retains its own <!DOCTYPE>, <style>, <link>, and <script> tags.
 */
function passThroughDocument(raw: string): string {
  return sanitizeHtml(raw);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HtmlPreviewProps {
  html: string;
  /** CSS class string applied to the <iframe> element. */
  className?: string;
  /** Minimum height for the empty state. */
  minHeight?: string;
}

// ---------------------------------------------------------------------------
// Sandboxed <iframe> renderer — used for ALL content now (both full
// documents and inline fragments) for consistent, isolated rendering.
// ---------------------------------------------------------------------------

function SandboxIframe({
  html,
  className = '',
}: {
  html: string;
  className?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState<string>('auto');

  const srcDoc = useMemo(() => {
    if (isFullDocument(html)) {
      return passThroughDocument(html);
    }
    // Fragment — wrap in a minimal shell
    const sanitized = sanitizeHtml(html);
    return buildShellForFragment(sanitized);
  }, [html]);

  // Auto-resize the iframe to match its internal document height so the
  // containing page doesn't get a double scrollbar.
  const handleLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument?.body) return;

    const measure = () => {
      const body = iframe.contentDocument?.body;
      if (!body) return;
      const h = body.scrollHeight;
      if (h > 0) {
        iframe.style.height = `${h}px`;
        setIframeHeight(`${h}px`);
      }
    };

    // Initial measurement
    measure();

    // Re-measure on any layout change (images loading, font swaps, JS DOM
    // mutations, CSS transitions finishing, etc.)
    const observer = new ResizeObserver(() => measure());
    observer.observe(iframe.contentDocument.body);

    // Also listen for messages posted by embedded scripts that want to
    // resize the iframe dynamically (e.g. an interactive exercise that
    // expands/collapses sections). Scripts can call:
    //   parent.postMessage({ type: 'resize' }, '*');
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'resize') measure();
    };
    window.addEventListener('message', onMessage);

    return () => {
      observer.disconnect();
      window.removeEventListener('message', onMessage);
    };
  }, []);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcDoc}
      onLoad={handleLoad}
      title="Lesson Content"
      // allow-scripts enables interactive JS (matching games, audio
      // buttons, quizzes). We deliberately OMIT allow-same-origin and
      // allow-top-navigation so scripts can't access the parent page's
      // cookies, localStorage, or navigate the admin dashboard away.
      sandbox="allow-scripts"
      className={`w-full border-0 bg-transparent block ${className}`}
      style={{ height: iframeHeight, minHeight: '6rem' }}
    />
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

/**
 * HtmlPreview — renders lesson HTML inside a sandboxed <iframe> for a
 * consistent, browser-like experience regardless of whether the content
 * is a full HTML document or an inline-style fragment.
 */
export function HtmlPreview({
  html,
  className = '',
  minHeight = '6rem',
}: HtmlPreviewProps) {
  if (!html) {
    return (
      <div
        className={`flex items-center justify-center text-sm text-[var(--color-text-tertiary)] italic ${className}`}
        style={{ minHeight }}
      >
        No content
      </div>
    );
  }

  // ALL content now goes through the sandboxed iframe path so that
  // <style> blocks, CSS classes, <link> fonts, and <script> tags
  // all render exactly as they would in a real browser.
  return <SandboxIframe html={html} className={className} />;
}

export default HtmlPreview;