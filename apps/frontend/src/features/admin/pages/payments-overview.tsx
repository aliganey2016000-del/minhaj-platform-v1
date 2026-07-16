/**
 * Payments Overview — Admin/Org Admin
 * Collection rate, totals, and quick links into the other Payments pages.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../../lib/axios';

interface Stats {
  totalPaid: number;
  totalDue: number;
  totalStudents: number;
  studentsWithDebt: number;
  fullyPaid: number;
  collectionRate: number;
  totalTransactions: number;
  totalAmountProcessed: number;
}

export function PaymentsOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/payments/stats');
        setStats(data.data);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load payment stats');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="flex min-h-[400px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">💰 Payments Overview</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Collection performance across your organization</p>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        {stats && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 p-4 text-center">
                <p className="text-2xl font-bold text-green-700 dark:text-green-300">${stats.totalPaid.toLocaleString()}</p>
                <p className="text-xs text-green-600 dark:text-green-400">Collected</p>
              </div>
              <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-4 text-center">
                <p className="text-2xl font-bold text-red-700 dark:text-red-300">${stats.totalDue.toLocaleString()}</p>
                <p className="text-xs text-red-600 dark:text-red-400">Outstanding</p>
              </div>
              <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 p-4 text-center">
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{stats.collectionRate}%</p>
                <p className="text-xs text-blue-600 dark:text-blue-400">Collection Rate</p>
              </div>
              <div className="rounded-xl border border-purple-200 dark:border-purple-900/50 bg-purple-50 dark:bg-purple-950/30 p-4 text-center">
                <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{stats.totalTransactions}</p>
                <p className="text-xs text-purple-600 dark:text-purple-400">Transactions</p>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Collection Rate</span>
                <span className="text-lg font-bold text-primary-600">{stats.collectionRate}%</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
                <div className="h-full rounded-full bg-gradient-to-r from-green-500 to-primary-600 transition-all duration-700" style={{ width: `${stats.collectionRate}%` }} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                <div className="rounded-xl bg-[var(--color-surface-secondary)] p-4">
                  <p className="text-xs text-[var(--color-text-tertiary)]">Students with Debt</p>
                  <p className="text-2xl font-bold text-amber-600">{stats.studentsWithDebt} <span className="text-sm font-normal text-[var(--color-text-tertiary)]">of {stats.totalStudents}</span></p>
                </div>
                <div className="rounded-xl bg-[var(--color-surface-secondary)] p-4">
                  <p className="text-xs text-[var(--color-text-tertiary)]">Fully Paid Students</p>
                  <p className="text-2xl font-bold text-green-600">{stats.fullyPaid} <span className="text-sm font-normal text-[var(--color-text-tertiary)]">of {stats.totalStudents}</span></p>
                </div>
                <div className="rounded-xl bg-[var(--color-surface-secondary)] p-4">
                  <p className="text-xs text-[var(--color-text-tertiary)]">Total Transactions</p>
                  <p className="text-2xl font-bold text-primary-600">{stats.totalTransactions}</p>
                </div>
                <div className="rounded-xl bg-[var(--color-surface-secondary)] p-4">
                  <p className="text-xs text-[var(--color-text-tertiary)]">Total Processed</p>
                  <p className="text-2xl font-bold text-purple-600">${stats.totalAmountProcessed.toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Link to="/admin/payments/record" className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card hover:border-primary-400 transition-colors">
                <p className="text-2xl mb-2">💳</p>
                <p className="font-semibold">Payment Center</p>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">Record payments, set fees, and bulk charge</p>
              </Link>
              <Link to="/admin/payments/history" className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card hover:border-primary-400 transition-colors">
                <p className="text-2xl mb-2">📋</p>
                <p className="font-semibold">Payment History</p>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">Search & filter all transactions</p>
              </Link>
              <Link to="/admin/payments/outstanding" className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card hover:border-primary-400 transition-colors">
                <p className="text-2xl mb-2">⚠️</p>
                <p className="font-semibold">Outstanding Dues</p>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">{stats.studentsWithDebt} student{stats.studentsWithDebt === 1 ? '' : 's'} owe money</p>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default PaymentsOverview;
