/**
 * Student Analytics Report — full-page breakdown of the student body,
 * split out of Manage Students' embedded charts. Reached via Manage
 * Students' ⋮ actions menu → "View Detailed Analytics/Report".
 */
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GraduationCap, Users, Building2, BookOpen, School, Layers, ArrowLeft,
  Clock3, FileSpreadsheet, Printer, type LucideIcon,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, ResponsiveContainer,
} from 'recharts';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
import { useTheme } from '../../../store/theme-context';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SchoolBrief { _id: string; name: string; }

interface StudentStats {
  total: number;
  byStatus: { active: number; inactive: number; graduated: number; suspended: number };
  byGender: { gender: string; count: number }[];
  byClass: { classId: string | null; label: string; count: number }[];
  byDepartment: { department: string; count: number }[];
  byOrganization: { schoolId: string | null; name: string; count: number }[];
  byShift: { shift: string; count: number }[];
  enrollmentTrend: { month: string; count: number }[];
}

// ---------------------------------------------------------------------------
// Shared viz palette — same fixed-order formula used across the admin app's
// recharts-based breakdowns, so a slice and its legend row are always the
// same hue and colors are stable regardless of what data is present.
// ---------------------------------------------------------------------------

const VIZ_STYLE = `
  .viz-root {
    --series-1: #2a78d6; --series-2: #eb6834; --series-3: #1baf7a; --series-4: #eda100;
    --series-5: #e87ba4; --series-6: #008300; --series-7: #4a3aa7; --series-8: #e34948;
    --status-good: #0ca30c; --status-warning: #fab219; --status-serious: #ec835a; --status-critical: #d03b3b;
  }
  @media (prefers-color-scheme: dark) {
    :root:where(:not([data-theme="light"])) .viz-root {
      --series-1: #3987e5; --series-2: #d95926; --series-3: #199e70; --series-4: #c98500;
      --series-5: #d55181; --series-6: #008300; --series-7: #9085e9; --series-8: #e66767;
    }
  }
  :root[data-theme="dark"] .viz-root {
    --series-1: #3987e5; --series-2: #d95926; --series-3: #199e70; --series-4: #c98500;
    --series-5: #d55181; --series-6: #008300; --series-7: #9085e9; --series-8: #e66767;
  }
  @media print {
    .no-print { display: none !important; }
    .viz-root { break-inside: avoid; }
  }
`;

function foldTop(rows: { label: string; count: number }[], max = 7): { label: string; count: number }[] {
  const sorted = [...rows].filter(r => r.count > 0).sort((a, b) => b.count - a.count);
  const head = sorted.slice(0, max);
  const restCount = sorted.slice(max).reduce((s, r) => s + r.count, 0);
  if (restCount > 0) head.push({ label: 'Other', count: restCount });
  return head;
}

function StatTile({ label, value, colorVar }: { label: string; value: number; colorVar: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-[var(--color-surface-primary)] p-4 shadow-sm flex flex-col gap-1">
      <span className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider truncate">{label}</span>
      <span className="text-2xl font-bold tabular-nums" style={{ color: `var(${colorVar})` }}>{value.toLocaleString()}</span>
    </div>
  );
}

/** Slice color for index i — same fixed-order formula the legend rows below use, so a slice and its legend row are always the same hue. */
function seriesColor(label: string, i: number, colorOffset: number): string {
  return label === 'Other' ? 'var(--color-text-tertiary)' : `var(--series-${((i + colorOffset) % 8) + 1})`;
}

function BreakdownDonut({ items, colorOffset, size = 92 }: { items: { label: string; count: number }[]; colorOffset: number; size?: number }) {
  const data = items.map((item, i) => ({ name: item.label, value: item.count, fill: seriesColor(item.label, i, colorOffset) }));
  return (
    <PieChart width={size} height={size} className="flex-shrink-0">
      <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={size * 0.32} outerRadius={size * 0.48} paddingAngle={data.length > 1 ? 2 : 0} strokeWidth={2} stroke="var(--color-surface-primary)" isAnimationActive={false}>
        {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
      </Pie>
      <RechartsTooltip
        formatter={(value, name) => [typeof value === 'number' ? value.toLocaleString() : String(value ?? ''), String(name)]}
        contentStyle={{ fontSize: 12, borderRadius: 8, background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)' }}
      />
    </PieChart>
  );
}

function BarList({ title, icon: Icon, items, colorOffset = 0, emptyLabel }: {
  title: string; icon: LucideIcon; items: { label: string; count: number }[]; colorOffset?: number; emptyLabel?: string;
}) {
  const max = Math.max(1, ...items.map(i => i.count));
  return (
    <div className="viz-root rounded-2xl border border-slate-100 dark:border-slate-800 bg-[var(--color-surface-primary)] p-5 shadow-sm">
      <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text-primary)] mb-4">
        <Icon className="h-[18px] w-[18px] text-[var(--color-text-tertiary)]" strokeWidth={1.75} />
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-[var(--color-text-tertiary)]">{emptyLabel || 'No data yet'}</p>
      ) : (
        <div className="flex items-center gap-4">
          {items.length > 1 && <BreakdownDonut items={items} colorOffset={colorOffset} />}
          <div className="flex-1 min-w-0 space-y-2.5">
            {items.map((item, i) => {
              const colorVar = seriesColor(item.label, i, colorOffset);
              return (
                <div key={item.label + i}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: colorVar }} />
                    <span className="text-xs font-medium text-[var(--color-text-secondary)] truncate flex-1">{item.label}</span>
                    <span className="text-xs font-semibold text-[var(--color-text-primary)] tabular-nums flex-shrink-0">{item.count.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden" title={`${item.label}: ${item.count}`}>
                    <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.max(3, (item.count / max) * 100)}%`, backgroundColor: colorVar }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-100 dark:border-slate-800 bg-[var(--color-surface-primary)] px-3 py-2 shadow-lg text-xs">
      {label && <p className="font-semibold text-[var(--color-text-primary)] mb-0.5">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-[var(--color-text-secondary)]">
          <span className="inline-block h-2 w-2 rounded-full mr-1.5" style={{ background: p.color || p.fill }} />
          {p.name}: <span className="font-semibold text-[var(--color-text-primary)]">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

// ---------------------------------------------------------------------------
// Printable PDF — mirrors the Excel export's data as a self-contained HTML
// document in a new window, then triggers the browser's print dialog (same
// window.open → write → print pattern used elsewhere in the app for
// invoices/attendance sheets — there's no PDF-generation library in this
// codebase, and charts can't be replayed into a raw print window anyway).
// ---------------------------------------------------------------------------

function buildPrintHtml(stats: StudentStats, orgLabel: string): string {
  const section = (title: string, rows: [string, number][]) => `
    <h2>${title}</h2>
    <table>
      <thead><tr><th>Label</th><th>Count</th></tr></thead>
      <tbody>${rows.map(([label, count]) => `<tr><td>${label}</td><td>${count.toLocaleString()}</td></tr>`).join('')}</tbody>
    </table>`;

  const genderLabels: Record<string, string> = { male: 'Male', female: 'Female' };

  return `
    <html>
      <head>
        <title>Student Analytics Report</title>
        <style>
          body { font-family: -apple-system, Segoe UI, Arial, sans-serif; color: #1e293b; padding: 32px; }
          h1 { font-size: 22px; margin-bottom: 2px; }
          .meta { color: #64748b; font-size: 13px; margin-bottom: 24px; }
          h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.04em; color: #334155; margin: 22px 0 8px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
          th { text-align: left; background: #f1f5f9; padding: 6px 10px; font-size: 12px; }
          td { padding: 6px 10px; font-size: 13px; border-bottom: 1px solid #e2e8f0; }
          .total { font-size: 15px; font-weight: 700; margin-bottom: 4px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>🎓 Student Analytics Report</h1>
        <p class="meta">${orgLabel} · Generated ${new Date().toLocaleString()}</p>
        <p class="total">Total Students: ${stats.total.toLocaleString()}</p>
        ${section('Status Breakdown', Object.entries(stats.byStatus).map(([k, v]) => [k[0].toUpperCase() + k.slice(1), v]))}
        ${section('Gender', stats.byGender.map(r => [genderLabels[r.gender] || 'Unspecified', r.count]))}
        ${section('Department', stats.byDepartment.map(r => [r.department, r.count]))}
        ${section('Class', stats.byClass.map(r => [r.label, r.count]))}
        ${section('Organization', stats.byOrganization.map(r => [r.name, r.count]))}
        ${section('Shift', stats.byShift.map(r => [r.shift, r.count]))}
        ${section('Enrollment Trend (last 12 months)', stats.enrollmentTrend.map(r => [monthLabel(r.month), r.count]))}
      </body>
    </html>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function StudentReport() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const isSuperAdmin = user?.role === 'admin';
  const isOrgAdmin = user?.role === 'org_admin';

  const [schools, setSchools] = useState<SchoolBrief[]>([]);
  const [filterSchool, setFilterSchool] = useState('');
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => { (async () => { try { const { data } = await api.get('/schools', { params: { limit: '100' } }); setSchools(data.data || []); } catch { /* ignore */ } })(); }, []);

  const fetchStats = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: any = {};
      if (filterSchool) params.school = filterSchool;
      const { data } = await api.get('/students/stats', { params });
      setStats(data.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [filterSchool]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const orgLabel = isOrgAdmin
    ? (schools[0]?.name || 'Your Organization')
    : (schools.find(s => s._id === filterSchool)?.name || 'All Organizations');

  const handleExportExcel = async () => {
    setExporting(true); setError('');
    try {
      const token = localStorage.getItem('accessToken') || '';
      const qs = filterSchool ? `?school=${encodeURIComponent(filterSchool)}` : '';
      const response = await fetch(`${api.defaults.baseURL}/students/report/export${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `student-analytics-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to export report');
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = () => {
    if (!stats) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(buildPrintHtml(stats, orgLabel));
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  const genderLabels: Record<string, string> = { male: 'Male', female: 'Female' };
  const genderRows = stats ? foldTop(stats.byGender.map(g => ({ label: genderLabels[g.gender] || 'Unspecified', count: g.count })), 8) : [];
  const classRows = stats ? foldTop(stats.byClass.map(c => ({ label: c.label, count: c.count }))) : [];
  const deptRows = stats ? foldTop(stats.byDepartment.map(d => ({ label: d.department, count: d.count }))) : [];
  const orgRows = stats ? foldTop(stats.byOrganization.map(o => ({ label: o.name, count: o.count }))) : [];
  const shiftRows = stats ? foldTop(stats.byShift.map(s => ({ label: s.shift, count: s.count })), 8) : [];
  const trendData = stats ? stats.enrollmentTrend.map(r => ({ month: monthLabel(r.month), count: r.count })) : [];

  const gridColor = isDark ? '#1e293b' : '#e2e8f0';
  const axisColor = isDark ? '#64748b' : '#94a3b8';

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="viz-root mx-auto max-w-screen-2xl space-y-6">
        <style>{VIZ_STYLE}</style>

        {/* Header */}
        <div className="no-print flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <button onClick={() => navigate('/admin/students')} className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors">
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} /> Back to Manage Students
            </button>
            <h1 className="flex items-center gap-2.5 text-2xl sm:text-3xl font-bold text-[var(--color-text-primary)]">
              <GraduationCap className="h-7 w-7 sm:h-8 sm:w-8 text-primary-600" strokeWidth={1.75} />
              Student Analytics Report
            </h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{orgLabel} · Full demographic &amp; enrollment breakdown</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center flex-shrink-0">
            {isSuperAdmin && (
              <select value={filterSchool} onChange={e => setFilterSchool(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm text-[var(--color-text-primary)]">
                <option value="">All Organizations</option>
                {schools.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            )}
            <button onClick={handleExportExcel} disabled={exporting || !stats} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] disabled:opacity-50 transition-colors inline-flex items-center gap-1.5">
              {exporting ? <div className="h-3.5 w-3.5 animate-spin rounded-full border border-[var(--color-border-default)] border-t-primary-600" /> : <FileSpreadsheet className="h-3.5 w-3.5" strokeWidth={1.75} />} Export Excel
            </button>
            <button onClick={handleExportPdf} disabled={!stats} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] disabled:opacity-50 transition-colors inline-flex items-center gap-1.5">
              <Printer className="h-3.5 w-3.5" strokeWidth={1.75} /> Export PDF
            </button>
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-center"><p className="text-red-600 text-sm mb-2">{error}</p><button onClick={fetchStats} className="text-primary-600 font-medium text-sm hover:underline">Retry</button></div>}

        {loading && !stats && <div className="flex justify-center py-16"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>}

        {stats && (
          <div className="space-y-4">
            {/* KPI tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatTile label="Total Students" value={stats.total} colorVar="--series-1" />
              <StatTile label="Active" value={stats.byStatus.active} colorVar="--status-good" />
              <StatTile label="Inactive" value={stats.byStatus.inactive} colorVar="--color-text-tertiary" />
              <StatTile label="Graduated" value={stats.byStatus.graduated} colorVar="--series-1" />
              <StatTile label="Suspended" value={stats.byStatus.suspended} colorVar="--status-critical" />
            </div>

            {/* Enrollment trend */}
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-[var(--color-surface-primary)] p-5 shadow-sm">
              <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text-primary)] mb-4">
                <Clock3 className="h-[18px] w-[18px] text-[var(--color-text-tertiary)]" strokeWidth={1.75} /> Enrollment Trend — Last 12 Months
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={gridColor} />
                    <XAxis dataKey="month" tick={{ fill: axisColor, fontSize: 11 }} axisLine={{ stroke: gridColor }} tickLine={false} />
                    <YAxis tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <RechartsTooltip content={<ChartTooltip />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }} />
                    <Bar dataKey="count" name="Enrollments" fill={isDark ? '#3987e5' : '#2a78d6'} radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Breakdown charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <BarList title="By Gender" icon={Users} items={genderRows} />
              <BarList title="By Department" icon={Building2} items={deptRows} colorOffset={2} emptyLabel="No department data" />
              <BarList title="By Class" icon={BookOpen} items={classRows} colorOffset={4} emptyLabel="No class data" />
              <BarList title="By Organization" icon={School} items={orgRows} colorOffset={6} emptyLabel="No organization data" />
              <BarList title="By Shift" icon={Layers} items={shiftRows} colorOffset={1} emptyLabel="No shift data" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default StudentReport;
