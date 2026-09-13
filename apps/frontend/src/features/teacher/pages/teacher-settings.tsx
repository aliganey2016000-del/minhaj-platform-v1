import { useState } from 'react';
import { CheckCircle2, Languages, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/axios';
import { useTheme } from '../../../store/theme-context';

export function TeacherSettings() {
  const { i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [language, setLanguage] = useState(i18n.language || 'en');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const changeLanguage = async (nextLanguage: string) => {
    const previousLanguage = language;
    setLanguage(nextLanguage);
    setSaving(true);
    setMessage('');
    setError('');
    await i18n.changeLanguage(nextLanguage);
    localStorage.setItem('masjid-language', nextLanguage);
    document.documentElement.dir = nextLanguage === 'ar' ? 'rtl' : 'ltr';

    try {
      await api.patch('/auth/me', { preferredLanguage: nextLanguage });
      setMessage(nextLanguage === 'so' ? 'Luqadda waa la keydiyey.' : nextLanguage === 'ar' ? 'تم حفظ اللغة.' : 'Language saved.');
    } catch (requestError: any) {
      setLanguage(previousLanguage);
      await i18n.changeLanguage(previousLanguage);
      localStorage.setItem('masjid-language', previousLanguage);
      document.documentElement.dir = previousLanguage === 'ar' ? 'rtl' : 'ltr';
      setError(requestError?.response?.data?.message || 'Could not save your language preference.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-4 md:p-6 lg:p-8">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-600">Teacher portal</p>
        <h1 className="mt-1 text-2xl font-black text-[var(--color-text-primary)]">Settings</h1>
        <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Choose how your portal looks and which language it uses.</p>
      </header>

      {message && <div role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />{message}</div>}
      {error && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] shadow-sm">
        <section className="border-b border-[var(--color-border-subtle)] p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="rounded-xl bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/40"><Languages className="h-5 w-5" /></span>
            <div><h2 className="font-bold">Language</h2><p className="text-xs text-[var(--color-text-tertiary)]">This preference is saved to your account.</p></div>
          </div>
          <label className="block text-sm font-semibold" htmlFor="teacher-language">Portal language</label>
          <select id="teacher-language" value={language} disabled={saving} onChange={(event) => void changeLanguage(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-3 text-sm disabled:opacity-60">
            <option value="en">English</option>
            <option value="so">Soomaali</option>
            <option value="ar">العربية</option>
          </select>
        </section>

        <section className="p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="rounded-xl bg-amber-50 p-2 text-amber-600 dark:bg-amber-950/40">{theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}</span>
            <div><h2 className="font-bold">Appearance</h2><p className="text-xs text-[var(--color-text-tertiary)]">Theme is saved on this device.</p></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(['light', 'dark'] as const).map((option) => <button key={option} type="button" aria-pressed={theme === option} onClick={() => setTheme(option)} className={`rounded-xl border px-4 py-3 text-sm font-bold capitalize transition ${theme === option ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'border-[var(--color-border-default)] hover:bg-[var(--color-surface-secondary)]'}`}>{option}</button>)}
          </div>
        </section>
      </div>
    </main>
  );
}

export default TeacherSettings;
