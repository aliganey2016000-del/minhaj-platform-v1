/**
 * Official payment receipt PDF — server-generated so parents/students/admins
 * always get an identical, downloadable document regardless of browser
 * (the old approach was window.print() on generated HTML, which isn't a
 * real file and can't be reliably emailed/archived).
 */

import PDFDocument from 'pdfkit';

export interface ReceiptData {
  receiptNumber: string;
  schoolName: string;
  studentName: string;
  studentCode: string;
  invoiceTitle?: string;
  invoicePeriod?: string;
  amount: number;
  discount: number;
  method: string;
  paidAt: Date;
  confirmedByEmail: string;
  notes?: string;
  refunded?: boolean;
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  mobile_money: 'Mobile Money',
  online: 'Online Payment',
};

export function buildReceiptPdf(data: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const net = Math.max(0, data.amount - (data.discount || 0));

    // Renders a description (left, wrapping within its own column) and an
    // amount (right, single line) on the SAME row, using one explicit y for
    // both — doc.y after the first .text() call depends on how many lines
    // it wrapped to, so it can't be used to position the second call.
    const row = (label: string, value: string, opts: { color?: string; size?: number } = {}) => {
      const rowY = doc.y;
      doc.fontSize(opts.size || 11).fillColor(opts.color || '#1e293b');
      doc.text(label, 50, rowY, { width: 380 });
      const afterLabelY = doc.y;
      doc.text(value, 450, rowY, { width: 95, align: 'right' });
      doc.y = Math.max(afterLabelY, doc.y);
      doc.x = 50;
    };

    // ── Header ──
    doc.fontSize(20).fillColor('#059669').text(data.schoolName, { align: 'center' });
    doc.fontSize(11).fillColor('#64748b').text('Official Payment Receipt', { align: 'center' });
    doc.moveDown(1.5);

    doc.strokeColor('#10b981').lineWidth(1.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    if (data.refunded) {
      doc.fontSize(13).fillColor('#dc2626').text('⚠ THIS PAYMENT HAS BEEN REFUNDED', { align: 'center' });
      doc.moveDown(1);
    }

    // ── Metadata ──
    doc.fontSize(10).fillColor('#1e293b');
    doc.text(`Receipt No: ${data.receiptNumber}`);
    doc.text(`Date & Time: ${data.paidAt.toLocaleString()}`);
    doc.text(`Payment Method: ${METHOD_LABELS[data.method] || data.method}`);
    doc.moveDown(0.5);
    doc.text(`Student: ${data.studentName} (${data.studentCode})`);
    if (data.invoiceTitle) {
      doc.text(`Invoice: ${data.invoiceTitle}${data.invoicePeriod ? ` — ${data.invoicePeriod}` : ''}`);
    }
    doc.moveDown(1.5);

    // ── Amount table ──
    const tableTop = doc.y;
    doc.fontSize(9).fillColor('#059669');
    doc.text('DESCRIPTION', 50, tableTop);
    doc.text('AMOUNT', 450, tableTop, { width: 95, align: 'right' });
    doc.moveTo(50, doc.y + 4).lineTo(545, doc.y + 4).strokeColor('#a7f3d0').stroke();
    doc.moveDown(1);

    row(data.notes || data.invoiceTitle || 'Payment', `$${data.amount.toLocaleString()}`);

    if (data.discount > 0) {
      doc.moveDown(0.5);
      row('Discount', `-$${data.discount.toLocaleString()}`, { color: '#d97706' });
    }

    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#10b981').lineWidth(1.5).stroke();
    doc.moveDown(0.5);

    row(data.refunded ? 'Total Refunded' : 'Total Paid', `$${net.toLocaleString()}`, { color: '#059669', size: 13 });
    doc.moveDown(2);

    // ── Footer ──
    doc.fontSize(9).fillColor('#64748b');
    doc.text(`Confirmed by: ${data.confirmedByEmail}`);
    doc.moveDown(1);
    doc.fontSize(8).fillColor('#94a3b8').text(
      'This is a computer-generated receipt and does not require a physical signature.',
      { align: 'center' }
    );

    doc.end();
  });
}
