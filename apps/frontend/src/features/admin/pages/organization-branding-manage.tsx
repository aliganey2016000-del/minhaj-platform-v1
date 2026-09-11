import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2, UploadCloud, CheckCircle2, Building2 } from 'lucide-react';
import { useAuth } from '../../../store/auth-context';
import api from '../../../lib/axios';

interface SchoolBrief {
  _id: string;
  name: string;
  branding?: { logo?: string; themeColor?: string };
}

const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export function OrganizationBrandingManage() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [schools, setSchools] = useState<SchoolBrief[]>([]);
  const [selectedSchool, setSelectedSchool] = useState('');
  const [school, setSchool] = useState<SchoolBrief | null>(null);
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const isSuperAdmin = user?.role === 'admin';
  const isOrgAdmin = user?.role === 'org_admin';

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        if (isSuperAdmin) {
          const { data } = await api.get('/schools');
          if (!cancelled) {
            const list: SchoolBrief[] = data.data || [];
            setSchools(list);
            if (list.length === 1) setSelectedSchool(list[0]._id);
          }
        } else if (isOrgAdmin && user.organizationId) {
          setSelectedSchool(user.organizationId);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load organizations');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isSuperAdmin, isOrgAdmin, user?.organizationId]);

  useEffect(() => {
    if (!selectedSchool) {
      setSchool(null);
      setPreview('');
      return;
    }

    let cancelled = false;
    const loadBranding = async () => {
      setLoading(true);
      setError('');
      setMessage('');
      try {
        const { data } = await api.get(`/schools/${selectedSchool}/branding`);
        if (!cancelled) {
          const loaded: SchoolBrief = data.data?.school;
          setSchool(loaded);
          setPreview(loaded?.branding?.logo || '');
        }
      } catch (err: any) {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load organization branding');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadBranding();
    return () => { cancelled = true; };
  }, [selectedSchool]);

  const selectFile = (file?: File) => {
    if (!file) return;
    setMessage('');
    setError('');

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Please select a JPEG, PNG, GIF, or WebP image.');
      return;
    }
    if (file.size > MAX_LOGO_SIZE) {
      setError('Logo must be 2 MB or smaller.');
      return;
    }

    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    setPreview(url);

    void uploadLogo(file);
  };

  const uploadLogo = async (file: File) => {
    if (!selectedSchool) return;
    setUploading(true);
    setError('');
    setMessage('');
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post(`/schools/${selectedSchool}/branding/logo`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const logo = data.data?.branding?.logo || '';
      setPreview(logo);
      setSchool((prev) => prev ? { ...prev, branding: { ...(prev.branding || {}), logo } } : prev);
      window.dispatchEvent(new CustomEvent('organization-branding-updated', { detail: { organizationId: selectedSchool, logo } }));
      setMessage('Organization logo updated successfully.');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to upload organization logo');
      setPreview(school?.branding?.logo || '');
    } finally {
      setUploading(false);
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    }
  };

  const removeLogo = async () => {
    if (!selectedSchool || !school?.branding?.logo) return;
    if (!window.confirm('Remove this organization logo? The sidebar will return to the default icon.')) return;

    setRemoving(true);
    setError('');
    setMessage('');
    try {
      await api.delete(`/schools/${selectedSchool}/branding/logo`);
      setPreview('');
      setSchool((prev) => prev ? { ...prev, branding: { ...(prev.branding || {}), logo: '' } } : prev);
      window.dispatchEvent(new CustomEvent('organization-branding-updated', { detail: { organizationId: selectedSchool, logo: '' } }));
      setMessage('Organization logo removed. The default sidebar icon will be used.');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to remove organization logo');
    } finally {
      setRemoving(false);
    }
  };

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  if (!isSuperAdmin && !isOrgAdmin) {
    return (
      <div className="p-6 lg:p-10 pt-20 lg:pt-10">
        <div className="mx-auto max-w-xl rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-10 text-center shadow-card">
          <p className="text-4xl mb-4">🔒</p>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Organization Admin Only</h1>
          <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">Only an organization administrator or super admin can change organization branding.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Organization Branding</h1>
          <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Upload your organization logo. It will appear in the Admin Portal sidebar.</p>
        </div>

        {isSuperAdmin && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card">
            <label className="mb-2 block text-xs font-semibold text-[var(--color-text-secondary)]">Organization</label>
            {loading && schools.length === 0 ? (
              <p className="text-sm text-[var(--color-text-tertiary)]">Loading organizations...</p>
            ) : (
              <select
                value={selectedSchool}
                onChange={(e) => setSelectedSchool(e.target.value)}
                className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm focus:border-primary-500 focus:outline-none"
              >
                <option value="">Select an organization...</option>
                {schools.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
              </select>
            )}
          </div>
        )}

        {message && <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700"><CheckCircle2 className="h-4 w-4" />{message}</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        {selectedSchool && (
          <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card">
            <div className="border-b border-[var(--color-border-subtle)] px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/30 dark:text-primary-300"><Building2 className="h-5 w-5" /></div>
                <div>
                  <h2 className="font-semibold text-[var(--color-text-primary)]">{school?.name || 'Organization'}</h2>
                  <p className="text-xs text-[var(--color-text-tertiary)]">Admin Portal sidebar logo</p>
                </div>
              </div>
            </div>

            <div className="grid gap-8 p-6 md:grid-cols-[220px_1fr] md:items-center">
              <div className="flex justify-center">
                <div className="flex h-44 w-44 items-center justify-center overflow-hidden rounded-3xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4">
                  {preview ? (
                    <img src={preview} alt="Organization logo preview" className="max-h-full max-w-full object-contain" onError={() => setPreview('')} />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-[var(--color-text-tertiary)]"><ImagePlus className="h-10 w-10" /><span className="text-xs">No logo</span></div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Organization Logo</h3>
                  <p className="mt-1 text-xs leading-5 text-[var(--color-text-tertiary)]">Use a clear square or transparent-background logo. JPEG, PNG, GIF, and WebP are supported up to 2 MB.</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <input ref={fileRef} type="file" accept={ACCEPTED_TYPES.join(',')} className="hidden" onChange={(e) => { selectFile(e.target.files?.[0]); e.currentTarget.value = ''; }} />
                  <button type="button" disabled={uploading || removing} onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                    {uploading ? 'Uploading...' : preview ? 'Change Logo' : 'Upload Logo'}
                  </button>
                  {school?.branding?.logo && (
                    <button type="button" disabled={uploading || removing} onClick={removeLogo} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-5 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/50 dark:hover:bg-red-950/20">
                      {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      Remove
                    </button>
                  )}
                </div>

                <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3 text-xs text-[var(--color-text-tertiary)]">
                  <strong className="text-[var(--color-text-secondary)]">Where it appears:</strong> the logo replaces the default shield icon at the top-left of the Admin Portal sidebar. If no logo is uploaded, the default icon remains.
                </div>
              </div>
            </div>
          </div>
        )}

        {!selectedSchool && !loading && (
          <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] p-12 text-center text-sm text-[var(--color-text-tertiary)]">Select an organization to manage its logo.</div>
        )}
      </div>
    </div>
  );
}

export default OrganizationBrandingManage;
