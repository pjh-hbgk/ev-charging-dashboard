import * as XLSX from 'xlsx';
import { detectColumnMapping, FIELD_DEFINITIONS, type MappedField } from './fieldDefinitions';

export interface ParsedRawRow {
  rowNumber: number; // 1-based, matches Excel row for user-facing messages
  values: Record<MappedField, string | number | null>;
}

export interface ParsedWorkbook {
  sheetName: string;
  headerRowIndex: number; // 0-based
  columnMapping: Record<string, { field: MappedField; confidence: number; header: string }>;
  missingRequiredFields: MappedField[];
  rows: ParsedRawRow[];
}

/**
 * Excel serial dates read via SheetJS with cellDates:true produce a JS Date
 * whose UTC getters reflect the *displayed* spreadsheet value (SheetJS does
 * not know the source timezone, so it encodes the wall-clock numbers using
 * UTC methods). We must read them back with getUTC*, never local getters,
 * or the browser's own timezone would silently shift every timestamp.
 */
function excelDateToLocalString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function cellToValue(cell: unknown): string | number | null {
  if (cell === undefined || cell === null || cell === '') return null;
  if (cell instanceof Date) return excelDateToLocalString(cell);
  if (typeof cell === 'number') return cell;
  return String(cell).trim();
}

/**
 * Scan the first N rows of a sheet for the most likely header row: the row
 * whose cells best match our known field synonyms. Handles exports (like
 * Zaptec's) that prepend several metadata rows (installation name, address,
 * report date range) before the actual column headers.
 */
function findHeaderRow(matrix: unknown[][], maxScan = 30): { index: number; score: number } {
  let best = { index: 0, score: -1 };
  for (let r = 0; r < Math.min(maxScan, matrix.length); r++) {
    const row = matrix[r].map((c) => (c === undefined || c === null ? null : String(c)));
    const mapping = detectColumnMapping(row);
    let score = 0;
    mapping.forEach((v) => (score += v.confidence));
    // Require at least 3 recognized columns to consider this a header row.
    if (mapping.size >= 3 && score > best.score) {
      best = { index: r, score };
    }
  }
  return best;
}

export async function parseWorkbookFile(file: File): Promise<ParsedWorkbook> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const matrix: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

  const { index: headerRowIndex } = findHeaderRow(matrix);
  const headerRowRaw = matrix[headerRowIndex].map((c) => (c === undefined || c === null ? null : String(c).trim()));
  const mapping = detectColumnMapping(headerRowRaw);

  const columnMapping: ParsedWorkbook['columnMapping'] = {};
  mapping.forEach((v, col) => {
    columnMapping[String(col)] = { field: v.field, confidence: v.confidence, header: headerRowRaw[col] ?? '' };
  });

  const requiredFields = FIELD_DEFINITIONS.filter((d) => d.required).map((d) => d.field);
  const mappedFields = new Set(Array.from(mapping.values()).map((v) => v.field));
  const missingRequiredFields = requiredFields.filter((f) => !mappedFields.has(f));

  const rows: ParsedRawRow[] = [];
  for (let r = headerRowIndex + 1; r < matrix.length; r++) {
    const rawRow = matrix[r];
    if (!rawRow || rawRow.every((c) => c === null || c === undefined || String(c).trim() === '')) continue;

    // Sentinel "Total" / summary row often appended at the end of the export.
    const firstCell = rawRow[0] !== null && rawRow[0] !== undefined ? String(rawRow[0]).trim().toLowerCase() : '';
    if (firstCell === 'total' || firstCell === 'totals' || firstCell === 'sum') continue;

    const values = {} as Record<MappedField, string | number | null>;
    for (const def of FIELD_DEFINITIONS) values[def.field] = null;
    mapping.forEach((v, col) => {
      values[v.field] = cellToValue(rawRow[col]);
    });

    // Skip fully-empty mapped rows (e.g. stray blank line inside the data block)
    if (Object.values(values).every((v) => v === null)) continue;

    rows.push({ rowNumber: r + 1, values });
  }

  return { sheetName, headerRowIndex, columnMapping, missingRequiredFields, rows };
}
