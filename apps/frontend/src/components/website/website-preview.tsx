import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Monitor, Smartphone } from 'lucide-react';
import { WebsiteRenderer, type WebsiteOrganization, type WebsiteSiteDocument } from './website-renderer';

/** A real viewport: mobile breakpoints must follow the preview, not the editor. */
export function WebsitePreview({ site, organization, initialPageSlug = '' }: {
  site: WebsiteSiteDocument; organization: WebsiteOrganization; initialPageSlug?: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [pageSlug, setPageSlug] = useState(initialPageSlug);
  useEffect(() => setPageSlug(initialPageSlug), [initialPageSlug]);

  const ready = () => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((style) => doc.head.appendChild(style.cloneNode(true)));
    const base = doc.createElement('base');
    base.href = window.location.origin + '/';
    doc.head.appendChild(base);
    setMount(doc.getElementById('preview'));
  };

  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white p-4 text-slate-900">
      <div><p className="font-bold">Draft Preview</p><p className="text-xs text-slate-500">Changes are visible here before publishing. Links stay inside the preview.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Preview page" value={pageSlug} onChange={(e) => setPageSlug(e.target.value)} className="max-w-40 rounded-lg border p-2 text-sm">
          {site.pages.map((page) => <option key={page.id} value={page.slug}>{page.title}</option>)}
        </select>
        {(['desktop', 'mobile'] as const).map((item) => <button key={item} type="button" aria-pressed={device === item} onClick={() => setDevice(item)} className={`flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold ${device === item ? 'bg-slate-900 text-white' : 'bg-white'}`}>
          {item === 'desktop' ? <Monitor size={16} /> : <Smartphone size={16} />}{item === 'desktop' ? 'Desktop' : 'Mobile'}
        </button>)}
      </div>
    </div>
    <div className="p-2 sm:p-4">
      <iframe ref={frame} title="Organization website draft preview" sandbox="allow-same-origin" onLoad={ready}
        srcDoc={'<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}</style></head><body><div id="preview"></div></body></html>'}
        style={{ width: device === 'mobile' ? 390 : '100%', maxWidth: '100%', height: '72vh' }} className="mx-auto block rounded-xl border bg-white shadow-sm" />
      {mount && createPortal(<div onClickCapture={(event) => {
        const anchor = (event.target as HTMLElement).closest('a');
        if (!anchor) return;
        event.preventDefault();
        const url = new URL(anchor.getAttribute('href') || '/', window.location.origin);
        const slug = url.pathname.replace(/^\/+|\/+$/g, '');
        if (url.origin === window.location.origin && site.pages.some((page) => page.slug === slug)) {
          setPageSlug(slug);
          requestAnimationFrame(() => {
            if (url.hash) frame.current?.contentDocument?.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView();
            else frame.current?.contentWindow?.scrollTo(0, 0);
          });
        }
      }}><WebsiteRenderer site={site} organization={organization} pageSlug={pageSlug} preview /></div>, mount)}
    </div>
  </div>;
}
