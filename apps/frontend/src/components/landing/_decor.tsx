/**
 * Shared landing-page decor primitives.
 *
 * Keeps the "Emerald & Gold — Premium Islamic" identity consistent across
 * every section: one Islamic geometric pattern, one gold section eyebrow,
 * a star glyph, and a robust CSS-driven scroll-reveal.
 *
 * Reveal deliberately uses an IntersectionObserver to toggle a CSS class
 * (not a JS/RAF-driven animation library): compositor-driven CSS transitions
 * always settle on their end state, so content can never get stuck partially
 * faded the way RAF-throttled JS animations can on slow / backgrounded tabs.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Islamic geometric pattern — an 8-point star (khatam) tessellation used as a
// faint background texture. `tone` picks the stroke colour; opacity is set by
// the caller via className so it can be tuned per background.
// ---------------------------------------------------------------------------
export function IslamicPattern({
  className = '',
  tone = 'gold',
  size = 88,
}: {
  className?: string;
  tone?: 'gold' | 'emerald' | 'white';
  size?: number;
}) {
  const stroke =
    tone === 'gold' ? '#d4a24a' : tone === 'emerald' ? '#059669' : '#ffffff';
  const id = `khatam-${tone}-${size}`;
  return (
    <svg aria-hidden="true" className={className} width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id={id} width={size} height={size} patternUnits="userSpaceOnUse">
          <g fill="none" stroke={stroke} strokeWidth="1">
            <path d={`M${size / 2} 6 L${size - 6} ${size / 2} L${size / 2} ${size - 6} L6 ${size / 2} Z`} />
            <path
              d={`M${size / 2} 6 L${size * 0.78} ${size * 0.22} L${size - 6} ${size / 2} L${size * 0.78} ${size * 0.78} L${size / 2} ${size - 6} L${size * 0.22} ${size * 0.78} L6 ${size / 2} L${size * 0.22} ${size * 0.22} Z`}
            />
            <circle cx={size / 2} cy={size / 2} r={size * 0.14} />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

// Eight-point star glyph (khatam) — the recurring brand mark.
export function StarGlyph({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 1.5 13.68 7.93 19.42 4.58 16.07 10.32 22.5 12 16.07 13.68 19.42 19.42 13.68 16.07 12 22.5 10.32 16.07 4.58 19.42 7.93 13.68 1.5 12 7.93 10.32 4.58 4.58 10.32 7.93Z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Gold section eyebrow — a small star glyph + hairlines + uppercase label.
// ---------------------------------------------------------------------------
export function Eyebrow({
  children,
  center = false,
  className = '',
}: {
  children: ReactNode;
  center?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-3 text-[0.72rem] font-semibold uppercase tracking-[0.26em] text-gold-600 dark:text-gold-400 ${className}`}
    >
      <span className={`h-px w-6 bg-gradient-to-r from-transparent to-gold-400 ${center ? '' : 'hidden sm:block'}`} />
      <StarGlyph className="h-3.5 w-3.5 text-gold-500" />
      <span>{children}</span>
      <span className="h-px w-6 bg-gradient-to-l from-transparent to-gold-400" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Reveal — robust CSS scroll-reveal. Renders hidden, then flips a class when
// the element scrolls into view (or after a safety timeout, so nothing can
// ever stay invisible). `as` lets it wrap grid/list items without extra DOM.
// ---------------------------------------------------------------------------
export function Reveal({
  children,
  className = '',
  delay = 0,
  y = 28,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  as?: 'div' | 'li' | 'section' | 'span';
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setShown(true); return; }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { setShown(true); io.disconnect(); }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    // Safety net: never let content stay hidden if the observer misses.
    const fallback = window.setTimeout(() => setShown(true), 900);
    return () => { io.disconnect(); window.clearTimeout(fallback); };
  }, []);

  return (
    <Tag
      ref={ref as any}
      style={{ transitionDelay: `${delay}ms`, transform: shown ? undefined : `translateY(${y}px)` }}
      className={`transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${shown ? 'opacity-100 translate-y-0' : 'opacity-0'} ${className}`}
    >
      {children}
    </Tag>
  );
}
