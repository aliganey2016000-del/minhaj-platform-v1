/**
 * Student Profile — View personal info, change password with i18n
 */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../store/auth-context';
import api from '../../../lib/axios';

interface ProfileData {
  profile?: {
    firstName: string; lastName: string; gender: string;
    dateOfBirth?: string;
    address?: { street: string; city: string; state: string; country: string; zip: string };
    emergencyContact?: { name: string; phone: string; relationship: string };
  };
  student?: { studentId: string; status: string; attendancePercentage: number; gpa: number };
}

export function StudentProfile() {
  const { t, i18n } = useTranslation('common');
  const lang = i18n.language as 'en' | 'so' | 'ar';
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwMessage, setPwMessage] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [meRes, dashRes] = await Promise.all([
          api.get('/auth/me'),
          api.get('/students/my/dashboard').catch(() => ({ data: { data: {} } })),
        ]);
        setProfile({ profile: meRes.data.data?.profile, student: dashRes.data.data });
      } catch (err: any) { setError(err.response?.data?.message || t('error_occurred')); }
      finally { setLoading(false); }
    })();
  }, [t]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) { setPwError(lang==='so'?'Labada beerood waa loo baahan yahay':lang==='ar'?'كلا الحقلين مطلوب':'Both fields are required'); return; }
    if (newPassword.length < 8) { setPwError(lang==='so'?'Password-ku waa inuu yahay ugu yaraan 8 xaraf':lang==='ar'?'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل':'New password must be at least 8 characters'); return; }
    const pwRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/;
    if (!pwRegex.test(newPassword)) {
      setPwError(lang==='so'?'Password-ku waa inuu ka kooban yahay: xaraf weyn, xaraf yar, lambar, iyo calaamad gaar ah (@$!%*?&)':lang==='ar'?'يجب أن تحتوي كلمة المرور على: حرف كبير، حرف صغير، رقم، ورمز خاص (@$!%*?&)':'Password must contain: uppercase letter, lowercase letter, number, and special character (@$!%*?&)');
      return;
    }
    setPwLoading(true); setPwError(''); setPwMessage('');
    try {
      await api.patch('/auth/change-password', { currentPassword, newPassword });
      setPwMessage(t('password_changed'));
      setCurrentPassword(''); setNewPassword('');
    } catch (err: any) { setPwError(err.response?.data?.message || t('error_occurred')); }
    finally { setPwLoading(false); }
  };

  const genderLabels: Record<string, { so: string; ar: string }> = {
    male: { so: 'Lab', ar: 'ذكر' },
    female: { so: 'Dhedig', ar: 'أنثى' },
  };

  const getGender = (g: string) => {
    if (lang === 'so') return genderLabels[g]?.so || g;
    if (lang === 'ar') return genderLabels[g]?.ar || g;
    return g ? g.charAt(0).toUpperCase() + g.slice(1) : '—';
  };

  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;
  if (error) return <div className="text-center py-20"><p className="text-red-500 mb-4">{error}</p><button onClick={() => window.location.reload()} className="rounded-xl bg-primary-600 px-5 py-2 text-sm text-white">{t('retry')}</button></div>;

  const p = profile?.profile;
  const s = profile?.student;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">👤 {t('profile')}</h1>

        {/* User Info Card */}
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-2xl font-bold text-primary-600">
              {p?.firstName?.[0]}{p?.lastName?.[0]}
            </div>
            <div>
              <h2 className="text-xl font-bold">{p?.firstName} {p?.lastName}</h2>
              <p className="text-sm text-[var(--color-text-tertiary)]">{user?.email}</p>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                {s?.studentId && <span>{s.studentId} · </span>}
                <span className="capitalize">{lang==='so'?'Kaalinta':lang==='ar'?'الدور':'Role'}: {user?.role}</span>
                <span> · {user?.isVerified ? (lang==='so'?'✅ La xaqiijiyey':lang==='ar'?'✅ تم التحقق':'✅ Verified') : (lang==='so'?'❌ Lama xaqiijin':lang==='ar'?'❌ غير متحقق':'❌ Not verified')}</span>
              </p>
            </div>
          </div>

          {/* Student Stats */}
          {s && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg bg-[var(--color-surface-secondary)] p-3 text-center">
                <p className="text-lg font-bold text-green-600">{s.attendancePercentage}%</p>
                <p className="text-[10px] text-[var(--color-text-tertiary)]">{t('attendance')}</p>
              </div>
              <div className="rounded-lg bg-[var(--color-surface-secondary)] p-3 text-center">
                <p className="text-lg font-bold text-blue-600">{s.gpa > 0 ? s.gpa.toFixed(1) : '—'}</p>
                <p className="text-[10px] text-[var(--color-text-tertiary)]">{lang==='so'?'Celceliska':lang==='ar'?'المعدل':'GPA'}</p>
              </div>
              <div className="rounded-lg bg-[var(--color-surface-secondary)] p-3 text-center capitalize">
                <p className="text-lg font-bold text-purple-600">{s.status}</p>
                <p className="text-[10px] text-[var(--color-text-tertiary)]">{lang==='so'?'Xaaladda':lang==='ar'?'الحالة':'Status'}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[var(--color-border-subtle)]">
            <ProfileField label={lang==='so'?'Magaca Koowaad':lang==='ar'?'الاسم الأول':'First Name'} value={p?.firstName} />
            <ProfileField label={lang==='so'?'Magaca Dambe':lang==='ar'?'الاسم الأخير':'Last Name'} value={p?.lastName} />
            <ProfileField label={lang==='so'?'Jinsiga':lang==='ar'?'الجنس':'Gender'} value={getGender(p?.gender||'')} />
            <ProfileField label={lang==='so'?'Taariikhda Dhalasha':lang==='ar'?'تاريخ الميلاد':'Date of Birth'} value={p?.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString() : undefined} />
            <ProfileField label={t('language')} value={user?.preferredLanguage} />
            <ProfileField label={lang==='so'?'La xaqiijiyey':lang==='ar'?'تم التحقق':'Verified'} value={user?.isVerified ? (lang==='so'?'Haa':lang==='ar'?'نعم':'Yes') : (lang==='so'?'Maya':lang==='ar'?'لا':'No')} />
          </div>

          {p?.address && (p.address.street || p.address.city) && (
            <div className="mt-4 pt-4 border-t border-[var(--color-border-subtle)]">
              <h3 className="text-sm font-bold mb-2">{lang==='so'?'📍 Cinwaanka':lang==='ar'?'📍 العنوان':'📍 Address'}</h3>
              <p className="text-sm text-[var(--color-text-secondary)]">{[p.address.street, p.address.city, p.address.state, p.address.country, p.address.zip].filter(Boolean).join(', ') || (lang==='so'?'Lama bixin':lang==='ar'?'غير متوفر':'Not provided')}</p>
            </div>
          )}

          {p?.emergencyContact?.name && (
            <div className="mt-4 pt-4 border-t border-[var(--color-border-subtle)]">
              <h3 className="text-sm font-bold mb-2">{lang==='so'?'🆘 Xiriir Degdeg ah':lang==='ar'?'🆘 جهة اتصال الطوارئ':'🆘 Emergency Contact'}</h3>
              <p className="text-sm text-[var(--color-text-secondary)]">{p.emergencyContact.name} — {p.emergencyContact.relationship} — {p.emergencyContact.phone}</p>
            </div>
          )}
        </div>

        {/* Change Password */}
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card">
          <h2 className="text-lg font-bold mb-4">🔒 {t('change_password')}</h2>
          {pwMessage && <div className="mb-3 rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-3 text-sm text-green-700">{pwMessage}</div>}
          {pwError && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-600">{pwError}</div>}
          <form onSubmit={handleChangePassword} className="space-y-3 max-w-md">
            <div>
              <label className="text-xs font-semibold mb-1 block">{t('current_password')}</label>
              <input type="password" className="w-full rounded-xl border px-4 py-2.5 text-sm" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">{t('new_password')}</label>
              <input type="password" className="w-full rounded-xl border px-4 py-2.5 text-sm" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={8} required />
              <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">{lang==='so'?'Waa inuu ka kooban yahay: xaraf weyn, xaraf yar, lambar, iyo calaamad gaar ah':lang==='ar'?'يجب أن تحتوي على: حرف كبير، حرف صغير، رقم، ورمز خاص':'Must contain: uppercase, lowercase, number, and special character'}</p>
            </div>
            <button type="submit" disabled={pwLoading} className="rounded-xl bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60">{pwLoading ? (lang==='so'?'Cusbooneysiin...':lang==='ar'?'جاري التحديث...':'Updating...') : t('update_password')}</button>
          </form>
        </div>
      </div>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value?: string }) {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  return (
    <div>
      <p className="text-xs text-[var(--color-text-tertiary)]">{label}</p>
      <p className="text-sm font-medium text-[var(--color-text-primary)]">{value || (lang==='so'?'—':lang==='ar'?'—':'—')}</p>
    </div>
  );
}

export default StudentProfile;