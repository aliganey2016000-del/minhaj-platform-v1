import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Construction, LogIn } from 'lucide-react';
import api from '../../../lib/axios';
import { useTenant } from '../../../store/tenant-context';
import {
  WebsiteRenderer,
  type WebsiteOrganization,
  type WebsiteSiteDocument,
} from '../../../components/website/website-renderer';

interface PublicWebsitePayload {
  isMainSite: boolean;
  school?: WebsiteOrganization;
  site?: WebsiteSiteDocument | null;
}

export function TenantWebsitePage() {
  const { pageSlug = '' } = useParams();
  const { tenant, isLoading: tenantLoading, error: tenantError } = useTenant();
  const [payload, setPayload] = useState<PublicWebsitePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (tenantLoading) return;

    if (!tenant || tenant.isMainSite) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        setLoading(true);
        setError('');
        const { data } = await api.get('/website-management/public/current');
        if (!cancelled) setPayload(data.data);
      } catch (err: any) {
        if (!cancelled) setError(err.response?.data?.message || 'Unable to load this organization website.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [tenant, tenantLoading]);

  useEffect(() => {
    const site = payload?.site;
    const school = payload?.school;
    if (!site || !school) return;
    const normalized = pageSlug.replace(/^\/+|\/+$/g, '').toLowerCase();
    const page = site.pages.find((item) => item.slug.toLowerCase() === normalized)
      || (!normalized ? site.pages.find((item) => item.slug === '') : undefined);
    document.title = page?.seoTitle || site.seo.siteTitle || school.name;

    const description = page?.seoDescription || site.seo.description;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    if (description) meta.content = description;
  }, [payload, pageSlug]);

  if (tenantLoading || loading) {
    return <div className="flex min-h-screen items-center justify-center bg-white"><div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-600" /></div>;
  }

  if (tenantError || error) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-center"><div className="max-w-md"><h1 className="text-2xl font-bold text-slate-900">Website unavailable</h1><p className="mt-3 text-sm leading-6 text-slate-600">{tenantError || error}</p></div></div>;
  }

  if (!payload?.school || !payload.site) {
    const name = payload?.school?.name || tenant?.name || 'Organization';
    const logo = payload?.school?.branding?.logo || tenant?.branding?.logo;
    const primary = payload?.school?.branding?.themeColor || tenant?.branding?.themeColor || '#0d9488';
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-12">
          {logo ? <img src={logo} alt={name} className="mx-auto h-20 w-20 rounded-2xl object-contain" /> : <div style={{ backgroundColor: primary }} className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl text-white"><Construction className="h-9 w-9" /></div>}
          <h1 className="mt-6 text-3xl font-bold text-slate-900">{name}</h1>
          <p className="mt-3 text-slate-600">Our public website is being prepared. The learning portal is still available.</p>
          <a href="/auth/login" style={{ backgroundColor: primary }} className="mt-7 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-sm"><LogIn className="h-4 w-4" />Portal Login</a>
        </div>
      </div>
    );
  }

  return <WebsiteRenderer site={payload.site} organization={payload.school} pageSlug={pageSlug} />;
}

export default TenantWebsitePage;
