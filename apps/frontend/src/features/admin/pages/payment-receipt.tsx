import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, Mail, Printer, X, ShieldCheck } from 'lucide-react';
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
  branding?: { logo?: string; themeColor?: string };
}

const money = (n: number) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const methodLabel: Record<string, string> = {
  cash: 'Cash',
  mobile_money: 'Mobile Money',
  bank_transfer: 'Bank Transfer',
  online: 'Online Payment',
};

function numberToWords(n: number): string {
  const ones = ['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const belowThousand = (value: number): string => {
    if (value < 20) return ones[value];
    if (value < 100) return tens[Math.floor(value / 10)] + (value % 10 ? `-${ones[value % 10]}` : '');
    return `${ones[Math.floor(value / 100)]} Hundred${value % 100 ? ` ${belowThousand(value % 100)}` : ''}`;
  };
  const value = Math.max(0, Math.round(Number(n || 0)));
  if (value < 1000) return belowThousand(value);
  if (value < 1000000) return `${belowThousand(Math.floor(value / 1000))} Thousand${value % 1000 ? ` ${belowThousand(value % 1000)}` : ''}`;
  if (value < 1000000000) return `${belowThousand(Math.floor(value / 1000000))} Million${value % 1000000 ? ` ${numberToWords(value % 1000000)}` : ''}`;
  return `${belowThousand(Math.floor(value / 1000000000))} Billion${value % 1000000000 ? ` ${numberToWords(value % 1000000000)}` : ''}`;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || 'OR';
}

export function PaymentReceipt({ data, onClose }: { data: PaymentReceiptData; onClose: () => void }) {
  const [branding, setBranding] = useState<BrandingResponse>({});
  const [schoolId, setSchoolId] = useState<string | undefined>(data.student?.school?._id || data.student?.school);

  const studentName = `${data.student?.profile?.firstName || ''} ${data.student?.profile?.lastName || ''}`.trim() || data.student?.studentId || 'Student';
  const schoolName = branding.name || data.student?.school?.name || 'Organization';
  const paidAmount = Number(data.amount || data.payment?.amount || 0);
  const previousPaid = Number(data.invoice?.amountPaid || 0) - paidAmount;
  const safePreviousPaid = Math.max(0, previousPaid);
  const balance = Math.max(0, Number(data.invoice?.amount || 0) - safePreviousPaid - paidAmount);
  const receiptNumber = data.payment?.receiptNumber || data.payment?._id || `RCP-${Date.now()}`;
  const paidAt = data.payment?.createdAt || data.paymentDate || new Date().toISOString();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let sid = schoolId;
        if (!sid && data.student?._id) {
          const response = await api.get(`/students/${data.student._id}`);
          const loaded = response.data?.data || response.data;
          sid = loaded?.school?._id || loaded?.school;
          if (sid && !cancelled) setSchoolId(String(sid));
        }
        if (!sid || cancelled) return;
        const { data: response } = await api.get(`/schools/${sid}/branding`);
        if (!cancelled) setBranding(response.data || response);
      } catch {
        // Receipt remains usable with the organization name fallback.
      }
    })();
    return () => { cancelled = true; };
  }, [data.student?._id, schoolId]);

  const verificationCode = useMemo(() => `${receiptNumber}-${String(data.student?.studentId || '').replace(/\W/g, '').slice(-6)}`, [receiptNumber, data.student?.studentId]);

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
    <div className="receipt-overlay fixed inset-0 z-[100] overflow-y-auto bg-slate-950/70 p-2 sm:p-5 print:static print:bg-white print:p-0">
      <style>{`
        @page { size: A4; margin: 8mm; }
        @media print {
          html, body { background: #fff !important; }
          body * { visibility: hidden !important; }
          .receipt-overlay, .receipt-overlay * { visibility: visible !important; }
          .receipt-overlay { position: absolute !important; inset: 0 !important; overflow: visible !important; background: white !important; }
          .receipt-no-print { display: none !important; }
          .receipt-paper { box-shadow: none !important; border: 0 !important; max-width: none !important; width: 100% !important; }
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      `}</style>

      <div className="receipt-no-print mx-auto mb-3 flex max-w-[1024px] items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white p-3 shadow-xl sm:px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><CheckCircle2 className="h-6 w-6" /></div>
          <div><p className="text-sm font-bold text-slate-900">Payment recorded successfully!</p><p className="text-xs text-slate-500">A branded receipt has been generated for this payment.</p></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={printReceipt} className="hidden items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:flex"><Printer className="h-4 w-4" /> Print</button>
          <button onClick={downloadOfficialPdf} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" /><span className="hidden sm:inline">Download PDF</span></button>
          <button onClick={onClose} aria-label="Close" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
      </div>

      <article className="receipt-paper mx-auto max-w-[1024px] overflow-hidden rounded-2xl bg-white shadow-2xl print:rounded-none">
        <header className="border-b border-slate-200 px-5 py-6 sm:px-10 sm:py-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              {branding.branding?.logo ? <img src={branding.branding.logo} alt={schoolName} className="h-20 w-20 rounded-xl object-contain" /> : <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-slate-100 text-xl font-bold text-slate-700">{initials(schoolName)}</div>}
              <div><h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{schoolName}</h1><p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Official Finance Office</p><p className="mt-1 text-xs text-slate-400">Knowledge · Skills · A Better Tomorrow</p></div>
            </div>
            <div className="text-left text-xs text-slate-500 sm:text-right"><p>Official Payment Receipt</p><p className="mt-1 font-mono font-bold text-slate-800">{receiptNumber}</p><p className="mt-1">{new Date(paidAt).toLocaleString()}</p></div>
          </div>
        </header>

        <div className="px-5 py-7 sm:px-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-slate-500">TRANSACTION DOCUMENT</p><h2 className="mt-1 text-4xl font-black tracking-tight text-slate-900">PAYMENT RECEIPT</h2><p className="mt-1 text-sm text-slate-500">Official record of payment received</p></div><span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> PAID</span></div>

          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            <section className="overflow-hidden rounded-xl border border-slate-200"><div className="bg-blue-50 px-4 py-3 text-xs font-bold uppercase tracking-wider text-blue-800">Student Information</div><div className="divide-y divide-slate-100 text-sm"><Row label="Name" value={studentName} strong /><Row label="Student ID" value={data.student?.studentId || '—'} mono /><Row label="Class / Cohort" value={data.student?.class?.title || data.student?.class?.name || '—'} /><Row label="Academic Year" value={data.invoice?.period || '—'} /></div></section>
            <section className="overflow-hidden rounded-xl border border-slate-200"><div className="bg-emerald-50 px-4 py-3 text-xs font-bold uppercase tracking-wider text-emerald-800">Payment Information</div><div className="divide-y divide-slate-100 text-sm"><Row label="Payment Method" value={methodLabel[data.method] || data.method} /><Row label="Transaction / Reference" value={data.reference || data.payment?.reference || '—'} mono /><Row label="Paid Amount" value={money(paidAmount)} strong /><Row label="Payment Date" value={new Date(paidAt).toLocaleDateString()} /><Row label="Status" value="PAID" badge /></div></section>
          </div>

          <section className="mt-5 overflow-hidden rounded-xl border border-slate-200"><div className="bg-blue-50 px-4 py-3 text-xs font-bold uppercase tracking-wider text-blue-800">Invoice Covered By This Payment</div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Invoice</th><th className="px-3 py-3">Description</th><th className="px-3 py-3">Period</th><th className="px-3 py-3 text-right">Invoice Amount</th><th className="px-3 py-3 text-right">Previous Paid</th><th className="px-3 py-3 text-right">This Payment</th><th className="px-3 py-3 text-right">Balance</th></tr></thead><tbody><tr className="border-t border-slate-100"><td className="px-3 py-4 font-mono text-xs font-semibold">{data.invoice?._id?.slice(-8).toUpperCase() || '—'}</td><td className="px-3 py-4 font-semibold text-slate-800">{data.invoice?.title || 'Invoice Payment'}</td><td className="px-3 py-4 text-slate-500">{data.invoice?.period || '—'}</td><td className="px-3 py-4 text-right">{money(data.invoice?.amount)}</td><td className="px-3 py-4 text-right">{money(safePreviousPaid)}</td><td className="px-3 py-4 text-right font-bold text-emerald-700">{money(paidAmount)}</td><td className="px-3 py-4 text-right font-bold text-slate-900">{money(balance)}</td></tr></tbody><tfoot><tr className="bg-blue-50"><td colSpan={5} className="px-3 py-3 text-right font-bold text-slate-700">TOTAL PAID</td><td colSpan={2} className="px-3 py-3 text-right text-xl font-black text-slate-900">{money(paidAmount)}</td></tr></tfoot></table></div></section>

          <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 px-5 py-4"><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Amount in Words</p><p className="mt-1 text-base font-bold text-emerald-900">{numberToWords(paidAmount)} US Dollars Only.</p></div>

          <div className="mt-5 grid gap-4 sm:grid-cols-[1.2fr_.8fr]">
            <div className="rounded-xl border border-slate-200 p-5"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><ShieldCheck className="h-5 w-5" /></div><div><p className="font-bold text-slate-900">Payment Received Successfully</p><p className="mt-1 text-sm text-slate-500">This receipt is an official record of the transaction and should be retained for future reference.</p></div></div></div>
            <div className="rounded-xl border border-slate-200 p-5 text-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Verification</p><p className="mt-2 font-mono text-sm font-bold text-slate-800">{verificationCode}</p><p className="mt-1 text-xs text-slate-500">Use the receipt number when contacting the Finance Office.</p></div>
          </div>

          <div className="mt-6 flex flex-col items-center justify-between gap-6 border-t border-slate-200 pt-6 sm:flex-row"><div className="text-center sm:text-left"><div className="h-10 w-44 border-b-2 border-slate-400" /><p className="mt-2 text-sm font-bold text-slate-800">Finance Office</p><p className="text-xs text-slate-500">Authorized Collector</p></div><div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-dashed border-blue-600 text-center text-[9px] font-black uppercase tracking-wider text-blue-700">{schoolName}<br />Finance<br />Official</div></div>
        </div>

        <footer className="bg-slate-900 px-6 py-5 text-center text-white"><p className="text-sm font-bold uppercase tracking-[0.2em]">{schoolName}</p><p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-slate-400">Education for a Better Tomorrow</p></footer>
      </article>
    </div>
  );
}

function Row({ label, value, strong, mono, badge }: { label: string; value: string; strong?: boolean; mono?: boolean; badge?: boolean }) {
  return <div className="flex items-center justify-between gap-3 px-4 py-2.5"><span className="text-slate-500">{label}</span>{badge ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700">{value}</span> : <span className={`${strong ? 'font-bold text-slate-900' : 'text-slate-700'} ${mono ? 'font-mono text-xs' : ''} text-right`}>{value}</span>}</div>;
}
