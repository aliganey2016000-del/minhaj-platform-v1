import * as XLSX from 'xlsx';

export function buildXlsxBuffer(headers: string[], rows: Array<Array<unknown>>, sheetName: string): Buffer {
  const normalizedRows = rows.map((row) => row.map((value) => (value === undefined || value === null ? '' : value)));
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...normalizedRows]);

  const widths = headers.map((header, colIdx) => {
    const maxLength = normalizedRows.reduce((max, row) => {
      const cellValue = row[colIdx];
      const length = cellValue === undefined || cellValue === null ? 0 : String(cellValue).length;
      return Math.max(max, length);
    }, header.length);

    return { wch: Math.min(Math.max(maxLength + 2, header.length + 2), 50) };
  });

  sheet['!cols'] = widths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
