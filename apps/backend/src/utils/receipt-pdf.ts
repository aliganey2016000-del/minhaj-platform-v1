/**
 * Official, color A5 payment receipt PDF.
 * A5 is exactly half an A4 sheet, suitable for compact receipt printing.
 */
import PDFDocument from 'pdfkit';

export interface ReceiptData {
  receiptNumber: string;
  schoolName: string;
  logo?: Buffer;
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

const NAVY = '#102A56';
const BLUE = '#1976D2';
const GREEN = '#079669';
const PALE_BLUE = '#EFF6FF';
const PALE_GREEN = '#ECFDF5';
const MUTED = '#64748B';
const INK = '#172554';
const BORDER = '#D8E3F0';

export function buildReceiptPdf(data: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 28, compress: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const left = 28;
    const right = pageWidth - 28;
    const width = right - left;
    const net = Math.max(0, data.amount - (data.discount || 0));
    const formatMoney = (amount: number) => `$${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const method = METHOD_LABELS[data.method] || data.method || '—';
    const date = data.paidAt.toLocaleString();

    // Branded header with a strong contrast that remains legible in print.
    doc.rect(0, 0, pageWidth, 105).fill(NAVY);
    doc.rect(0, 101, pageWidth, 4).fill(GREEN);

    let logoRendered = false;
    if (data.logo?.length) {
      try {
        doc.image(data.logo, left, 19, { fit: [42, 42] });
        logoRendered = true;
      } catch {
        // Unsupported logo formats should not prevent a receipt from being generated.
      }
    }

    const schoolX = logoRendered ? left + 52 : left;
    const schoolWidth = width - (schoolX - left);
    doc.font('Helvetica-Bold').fontSize(logoRendered ? 15 : 17).fillColor('#FFFFFF')
      .text(data.schoolName || 'School', schoolX, 22, { width: schoolWidth, height: 40, ellipsis: true });
    doc.font('Helvetica').fontSize(8).fillColor('#DCEAFE')
      .text('FINANCE OFFICE  •  OFFICIAL PAYMENT RECORD', schoolX, 59, { width: schoolWidth });
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFFFFF')
      .text('PAYMENT RECEIPT', left, 79, { width: width * 0.56 });
    doc.font('Helvetica').fontSize(7).fillColor('#DCEAFE')
      .text(`Receipt: ${data.receiptNumber}`, left + width * 0.56, 80, { width: width * 0.44, align: 'right', ellipsis: true });

    let y = 120;
    if (data.refunded) {
      doc.roundedRect(left, y, width, 25, 6).fill('#FEF2F2');
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#B91C1C')
        .text('THIS PAYMENT HAS BEEN REFUNDED', left + 10, y + 8, { width: width - 20, align: 'center' });
      y += 34;
    } else {
      doc.roundedRect(right - 62, y - 2, 62, 21, 10).fill(PALE_GREEN);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(GREEN)
        .text('✓  PAID', right - 62, y + 5, { width: 62, align: 'center' });
    }

    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text('PAYMENT DETAILS', left, y + 3);
    y += 22;

    const gap = 8;
    const cardWidth = (width - gap) / 2;
    const detailCard = (x: number, top: number, label: string, value: string, tint = PALE_BLUE, valueColor = INK) => {
      doc.roundedRect(x, top, cardWidth, 47, 7).fill(tint);
      doc.font('Helvetica-Bold').fontSize(7).fillColor(label === 'Amount' ? GREEN : BLUE)
        .text(label.toUpperCase(), x + 9, top + 8, { width: cardWidth - 18, ellipsis: true });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(valueColor)
        .text(value || '—', x + 9, top + 21, { width: cardWidth - 18, height: 22, ellipsis: true });
    };

    detailCard(left, y, 'Student', data.studentName);
    detailCard(left + cardWidth + gap, y, 'Student ID', data.studentCode);
    y += 55;
    detailCard(left, y, 'Payment method', method);
    detailCard(left + cardWidth + gap, y, 'Date & time', date);
    y += 58;

    // Invoice summary is a bordered panel, with wrapping for long invoice names.
    doc.roundedRect(left, y, width, 59, 7).lineWidth(0.8).strokeColor(BORDER).stroke();
    doc.font('Helvetica-Bold').fontSize(7).fillColor(MUTED)
      .text('INVOICE / DESCRIPTION', left + 10, y + 8, { width: width - 20 });
    const invoiceLine = [data.invoiceTitle || 'Payment', data.invoicePeriod].filter(Boolean).join(' — ');
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK)
      .text(invoiceLine, left + 10, y + 21, { width: width - 20, height: 27, ellipsis: true });
    y += 68;

    // Amount received panel is the visual focal point of the receipt.
    doc.roundedRect(left, y, width, 61, 8).fill(PALE_GREEN);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(GREEN)
      .text(data.refunded ? 'TOTAL REFUNDED' : 'AMOUNT RECEIVED', left + 12, y + 11, { width: width * 0.55 });
    doc.font('Helvetica').fontSize(7).fillColor('#477565')
      .text('Against selected invoice', left + 12, y + 25, { width: width * 0.55 });
    doc.font('Helvetica-Bold').fontSize(21).fillColor(data.refunded ? '#B91C1C' : GREEN)
      .text(formatMoney(net), left + width * 0.52, y + 19, { width: width * 0.43, align: 'right', lineBreak: false });
    y += 70;

    if (data.discount > 0) {
      doc.font('Helvetica').fontSize(8).fillColor('#B45309')
        .text(`Discount applied: ${formatMoney(data.discount)}`, left, y, { width });
      y += 14;
    }

    if (data.notes?.trim()) {
      doc.font('Helvetica-Bold').fontSize(7).fillColor(MUTED).text('NOTE', left, y, { width });
      y += 10;
      doc.font('Helvetica').fontSize(8).fillColor(INK)
        .text(data.notes.trim(), left, y, { width, height: 27, ellipsis: true });
      y += 31;
    }

    // Keep the receipt readable and the footer anchored within the A5 page.
    const footerTop = pageHeight - 55;
    if (y < footerTop - 35) {
      doc.moveTo(left, y).lineTo(right, y).lineWidth(0.7).strokeColor(BORDER).stroke();
      y += 10;
      doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text('Received by', left, y, { width });
      doc.font('Helvetica').fontSize(7).fillColor(MUTED)
        .text(data.confirmedByEmail || 'Finance Office / Authorized Collector', left, y + 12, { width: width * 0.62, ellipsis: true });
      doc.font('Helvetica').fontSize(7).fillColor(MUTED)
        .text(date, left + width * 0.62, y + 12, { width: width * 0.38, align: 'right', ellipsis: true });
    }

    doc.rect(0, footerTop, pageWidth, pageHeight - footerTop).fill(NAVY);
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF')
      .text((data.schoolName || 'SCHOOL').toUpperCase(), left, footerTop + 12, { width, align: 'center', ellipsis: true });
    doc.font('Helvetica').fontSize(7).fillColor('#DCEAFE')
      .text('Computer-generated receipt • Please retain for your records', left, footerTop + 27, { width, align: 'center' });

    doc.end();
  });
}
