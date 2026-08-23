import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, '../src/features/admin/pages/teachers-manage.tsx');
let text = fs.readFileSync(file, 'utf8');

const alreadyPatched = text.includes('System Account') && text.includes('New Password (optional)') && text.includes("teacher.user?.phone || ''");
if (alreadyPatched) {
  console.log('Teacher edit account fields already patched.');
  process.exit(0);
}

text = text.replace(
  "interface TeacherUser { _id: string; email: string; isVerified: boolean; isActive: boolean; }",
  "interface TeacherUser { _id: string; email: string; phone?: string; isVerified: boolean; isActive: boolean; }"
);
text = text.replace(
  "gender: teacher.profile?.gender || 'male', phone: '',",
  "gender: teacher.profile?.gender || 'male', phone: teacher.user?.phone || '',"
);
text = text.replace(
  "...(isEdit ? {} : { email: form.email, password: form.password, phone: form.phone || undefined })",
  "...(isEdit ? { email: form.email, phone: form.phone || undefined, ...(form.password ? { password: form.password } : {}) } : { email: form.email, password: form.password, phone: form.phone || undefined })"
);

const oldAccount = `{!isEdit && <><div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Email *</label><input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="email" value={form.email} onChange={e => handleChange('email', e.target.value)} required /></div><div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Password *</label><input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="password" value={form.password} onChange={e => handleChange('password', e.target.value)} required minLength={8} /></div><div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Phone</label><input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.phone} onChange={e => handleChange('phone', e.target.value)} /></div></>}`;
const newAccount = `<div className="rounded-xl border border-[var(--color-border-default)] p-3 space-y-3"><p className="text-xs font-bold uppercase tracking-wide text-primary-600">System Account</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Email *</label><input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="email" value={form.email} onChange={e => handleChange('email', e.target.value)} required /></div><div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Phone</label><input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="tel" value={form.phone} onChange={e => handleChange('phone', e.target.value)} /></div></div><div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">{isEdit ? 'New Password (optional)' : 'Password *'}</label><input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="password" autoComplete="new-password" value={form.password} onChange={e => handleChange('password', e.target.value)} required={!isEdit} minLength={8} placeholder={isEdit ? 'Leave blank to keep current password' : 'Minimum 8 characters'} /></div></div>`;
if (!text.includes(oldAccount)) throw new Error('Teacher edit account block not found');
text = text.replace(oldAccount, newAccount);

fs.writeFileSync(file, text);
console.log('Teacher edit account fields patch applied.');
