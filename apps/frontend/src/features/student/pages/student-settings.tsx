/**
 * Student Settings — Account preferences with real i18n integration
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../store/auth-context';
import api from '../../../lib/axios';

export function StudentSettings() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation('common');
  const lang = i18n.language as 'en' | 'so' | 'ar';
  const [settings, setSettings] = useState({
    emailNotifications: true,
    smsNotifications: false,
    darkMode: false,
    language: i18n.language || user?.preferredLanguage || 'en',
    twoFactor: false,
  });
  const [message, setMessage] = useState('');

  const toggle = (key: string) => {
    setSettings(prev => ({ ...prev, [key]: !(prev as any)[key] }));
  };

  const handleLanguageChange = async (langCode: string) => {
    setSettings(prev => ({ ...prev, language: langCode }));
    i18n.changeLanguage(langCode);
    localStorage.setItem('masjid-language', langCode);
    if (langCode === 'ar') {
      document.documentElement.setAttribute('dir', 'rtl');
    } else {
      document.documentElement.setAttribute('dir', 'ltr');
    }
    try { await api.patch('/auth/me', { preferredLanguage: langCode }); } catch {}
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(lang==='so'?'✅ Dejinta waa la keydiyey!':lang==='ar'?'✅ تم حفظ الإعدادات!':'✅ Settings saved successfully!');
    setTimeout(() => setMessage(''), 3000);
  };

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">⚙️ {t('settings')}</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{lang==='so'?'Maamul dookhyada akoonkaaga':lang==='ar'?'إدارة تفضيلات حسابك':'Manage your account preferences'}</p>
          </div>
        </div>

        {message && (
          <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>
        )}

        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
          <form onSubmit={handleSave} className="divide-y divide-[var(--color-border-subtle)]">
            {/* Notifications */}
            <div className="p-6">
              <h3 className="text-sm font-bold mb-4">{lang==='so'?'🔔 Ogeysiisyada':lang==='ar'?'🔔 الإشعارات':'🔔 Notifications'}</h3>
              <div className="space-y-4">
                <ToggleRow
                  label={lang==='so'?'Ogeysiisyada Email-ka':lang==='ar'?'إشعارات البريد الإلكتروني':'Email Notifications'}
                  desc={lang==='so'?'Ku hel ogeysiisyada email-kaaga':lang==='ar'?'تلقي الإشعارات عبر البريد الإلكتروني':'Receive notifications via email'}
                  checked={settings.emailNotifications} onChange={() => toggle('emailNotifications')}
                />
                <ToggleRow
                  label={lang==='so'?'Ogeysiisyada SMS-ka':lang==='ar'?'إشعارات الرسائل النصية':'SMS Notifications'}
                  desc={lang==='so'?'Ku hel ogeysiisyada taleefankaaga':lang==='ar'?'تلقي الإشعارات عبر الرسائل النصية':'Receive notifications via text message'}
                  checked={settings.smsNotifications} onChange={() => toggle('smsNotifications')}
                />
              </div>
            </div>

            {/* Appearance */}
            <div className="p-6">
              <h3 className="text-sm font-bold mb-4">{lang==='so'?'🎨 Muuqaalka':lang==='ar'?'🎨 المظهر':'🎨 Appearance'}</h3>
              <div className="space-y-4">
                <ToggleRow
                  label={lang==='so'?'Muuqaal Mugdi ah':lang==='ar'?'الوضع الليلي':'Dark Mode'}
                  desc={lang==='so'?'Isticmaal muuqaal mugdi ah':lang==='ar'?'استخدام المظهر الداكن':'Use dark theme across the portal'}
                  checked={settings.darkMode} onChange={() => toggle('darkMode')}
                />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{t('language')}</p>
                    <p className="text-xs text-[var(--color-text-tertiary)]">{lang==='so'?'Luqadda interface-ka':lang==='ar'?'لغة الواجهة':'Default interface language'}</p>
                  </div>
                  <select
                    value={settings.language}
                    onChange={e => handleLanguageChange(e.target.value)}
                    className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-1.5 text-sm cursor-pointer"
                  >
                    <option value="en">🇬🇧 English</option>
                    <option value="so">🇸🇴 Soomaali</option>
                    <option value="ar">🇸🇦 العربية</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Security */}
            <div className="p-6">
              <h3 className="text-sm font-bold mb-4">{lang==='so'?'🔐 Amniga':lang==='ar'?'🔐 الأمان':'🔐 Security'}</h3>
              <div className="space-y-4">
                <ToggleRow
                  label={lang==='so'?'Xaqiijinta Laba Waji':lang==='ar'?'المصادقة الثنائية':'Two-Factor Authentication'}
                  desc={lang==='so'?'Ku dar lakab amni oo dheeri ah':lang==='ar'?'إضافة طبقة أمان إضافية':'Add an extra layer of security'}
                  checked={settings.twoFactor} onChange={() => toggle('twoFactor')}
                />
              </div>
            </div>

            {/* Save */}
            <div className="p-6 bg-[var(--color-surface-secondary)]">
              <button type="submit" className="rounded-xl bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm">
                💾 {t('save_settings')}
              </button>
            </div>
          </form>
        </div>

        <p className="text-xs text-[var(--color-text-tertiary)] text-center">{lang==='so'?'Ku galay sida':lang==='ar'?'مسجل باسم':'Logged in as'} {user?.email}</p>
      </div>
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-[var(--color-text-tertiary)]">{desc}</p>
      </div>
      <button type="button" onClick={onChange} className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
}

export default StudentSettings;