import { useEffect, useState } from 'react';
import { CheckCircle2, Download, Printer, X } from 'lucide-react';
import api from '../../../lib/axios';

export interface PaymentReceiptData {
  payment: any;
  invoice: any;
  student: any;
  amount: number;
  method: string;
  reference?: string;
  notes?: string;
  paymentDate?: string;
}

interface BrandingResponse {
  name?: string;
  branding?: { logo?: string };
}

const money = (n: number) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const methodLabel: Record<string, string> = {
  cash: 'Cash',
  mobile_money: 'Mobile Money',
  bank_transfer: 'Bank Transfer',
  online: 'Online Payment',
};

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || 'OR';
}

export function PaymentReceipt({ data, onClose }: { data: PaymentReceiptData; onClose: () => void }) {
  const [branding, setBranding] = useState<BrandingResponse>({});

  const studentName = `${data.student?.profile?.firstName || ''} ${data.student?.profile?.lastName || ''}`.trim() || data.student?.studentId || 'Student';
  const schoolName = branding.name || data.student?.school?.name || 'Organization';
  const paidAmount = Number(data.amount || data.payment?.amount || 0);
  const originalPaid = Number(data.invoice?.amountPaid || 0);
  const previousPaid = Math.max(0, originalPaid - paidAmount);
  const invoiceAmount = Number(data.invoice?.amount || 0);
  const balance = Math.max(0, invoiceAmount - previousPaid - paidAmount);
  const receiptNumber = data.payment?.receiptNumber || data.payment?._id || `RCP-${Date.now()}`;
  const paidAt = data.payment?.createdAt || data.paymentDate || new Date().toISOString();

  useEffect(() => {
    let cancelled = false;
    const loadBranding = async () => {
      try {
        const schoolRef = data.student?.school;
        let schoolId = typeof schoolRef === 'string' ? schoolRef : schoolRef?._id;
        if (!schoolId && data.student?._id) {
          const response = await api.get(`/students/${data.student._id}`);
          const loaded = response.data?.data || response.data;
          schoolId = typeof loaded?.school === 'string' ? loaded.school : loaded?.school?._id;
        }
        if (!schoolId) return;
        const response = await api.get(`/schools/${schoolId}/branding`);
        if (!cancelled) setBranding(response.data?.data || response.data || {});
      } catch {
        // Keep the receipt usable with the organization-name fallback.
      }
    };
    loadBranding();
    return () => { cancelled = true; };
  }, [data.student?._id, data.student?.school]);

  const printReceipt = () => window.print();

  const downloadOfficialPdf = async () => {
    if (!data.payment?._id) return printReceipt();
    try {
      const response = await api.get(`/payments/${data.payment._id}/receipt`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${receiptNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      printReceipt();
    }
  };

  return (
    <div className="receipt-overlay fixed inset-0 z-[100] overflow-y-auto bg-slate-950/70 p-2 sm:p-4 print:static print:bg-white print:p-0">
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body * { visibility: hidden !important; }
          .receipt-overlay, .receipt-overlay * { visibility: visible !important; }
          .receipt-overlay { position: absolute !important; inset: 0 !important; overflow: visible !important; background: #fff !important; padding: 0 !important; }
          .receipt-no-print { display: none !important; }
          .receipt-paper { width: 148mm !important; max-width: 148mm !important; min-height: 105mm !important; margin: 0 !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
          .receipt-content { padding: 7mm !important; }
          .receipt-footer { padding: 3mm 7mm !important; }
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      `}</style>

      <div className="receipt-no-print mx-auto mb-3 flex max-w-[760px] items-center justify-between gap-3 rounded-xl border border-white/10 bg-white p-3 shadow-xl">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <div><p className="text-sm font-bold text-slate-900">Payment recorded successfully</p><p className="text-xs text-slate-500">Compact receipt — designed for half-A4 printing.</p></div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={printReceipt} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Printer className="h-4 w-4" /> Print</button>
          <button onClick={downloadOfficialPdf} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" /> <span className="hidden sm:inline">PDF</span></button>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
      </div>

      <article className="receipt-paper mx-auto w-full max-w-[760px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl print:border-0 print:rounded-none">
        <header className="border-b-2 border-slate-900 px-5 py-4 sm:px-7">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              {branding.branding?.logo ? (
                <img src={branding.branding.logo} alt={schoolName} className="h-12 w-12 shrink-0 rounded-lg object-contain" />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-black text-slate-700">{initials(schoolName)}</div>
              )}
              <div className="min-w-0">
                <h1 className="truncate text-lg font-black text-slate-900 sm:text-xl">{schoolName}</h1>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Finance Office</p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Payment Receipt</p>
              <p className="mt-0.5 font-mono text-xs font-black text-slate-900">{receiptNumber}</p>
              <p className="mt-0.5 text-[10px] text-slate-500">{new Date(paidAt).toLocaleDateString()}</p>
            </div>
          </div>
        </header>

        <div className="receipt-content px-5 py-5 sm:px-7 sm:py-6">
          <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
            <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Official Record</p><h2 className="text-2xl font-black tracking-tight text-slate-900">PAYMENT RECEIPT</h2></div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-black text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> PAID</span>
          </div>

          <section className="grid grid-cols-2 gap-x-5 gap-y-2.5 text-xs sm:grid-cols-4">
            <Info label="Student" value={studentName} strong />
            <Info label="Student ID" value={data.student?.studentId || '—'} />
            <Info label="Invoice" value={data.invoice?.title || 'Invoice Payment'} />
            <Info label="Period" value={data.invoice?.period || '—'} />
          </section>

          <div className="my-4 border-t border-slate-200" />

          <section className="grid grid-cols-2 gap-x-5 gap-y-2.5 text-xs sm:grid-cols-4">
            <Info label="Method" value={methodLabel[data.method] || data.method || '—'} />
            <Info label="Reference" value={data.reference || data.payment?.reference || '—'} mono />
            <Info label="Previous Paid" value={money(previousPaid)} />
            <Info label="Balance Due" value={money(balance)} strong />
          </section>

          <div className="mt-5 flex items-center justify-between rounded-lg border border-slate-300 bg-slate-50 px-4 py-3">
            <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Amount Received</p><p className="text-[9px] text-slate-400">Against selected invoice</p></div>
            <p className="text-2xl font-black text-slate-900">{money(paidAmount)}</p>
          </div>

          {data.notes?.trim() && <p className="mt-3 truncate text-[10px] text-slate-500"><span className="font-bold">Note:</span> {data.notes.trim()}</p>}

          <div className="mt-5 flex items-end justify-between gap-5 border-t border-slate-200 pt-3 text-[10px] text-slate-500">
            <div><p className="font-bold text-slate-700">Received by</p><p>Finance Office / Authorized Collector</p></div>
            <div className="text-right"><p className="font-bold text-slate-700">Date & Time</p><p>{new Date(paidAt).toLocaleString()}</p></div>
          </div>
        </div>

        <footer className="receipt-footer bg-slate-900 px-5 py-2.5 text-center text-white sm:px-7">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em]">{schoolName}</p>
          <p className="mt-0.5 text-[8px] text-slate-400">Official payment record • Please retain this receipt</p>
        </footer>
      </article>
    </div>
  );
}

function Info({ label, value, strong, mono }: { label: string; value: string; strong?: boolean; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-0.5 truncate ${strong ? 'font-bold text-slate-900' : 'text-slate-700'} ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}
