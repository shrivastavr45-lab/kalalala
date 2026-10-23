/** Serialize CSV rows with quoting, blank nulls, and spreadsheet-formula protection for text. */
export function serializeCsv(headers, rows) {
  const csvCell = (value) => {
    let text = value == null ? '' : String(value);
    if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}
