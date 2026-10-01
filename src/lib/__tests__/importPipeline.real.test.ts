import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseWorkbookFile } from '../import/excelParser';
import { buildImportPreview } from '../import/buildPreview';

// Sanity-checks the import pipeline against the real Zaptec export the user
// supplied, so column detection / parsing / preview logic is validated
// against real data, not just synthetic fixtures. Not part of the shipped
// app (the file itself isn't committed) — safe to skip if it's absent.
const fixturePath = path.resolve(__dirname, '../../../data/source.xlsx');
const has = fs.existsSync(fixturePath);

describe.skipIf(!has)('import pipeline against real Zaptec export', () => {
  it('detects the header row and maps required columns', async () => {
    const buf = fs.readFileSync(fixturePath);
    const file = new File([buf], 'source.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const parsed = await parseWorkbookFile(file);
    expect(parsed.missingRequiredFields).toEqual([]);
    const fields = Object.values(parsed.columnMapping).map((c) => c.field);
    expect(fields).toContain('user');
    expect(fields).toContain('charger');
    expect(fields).toContain('start');
    expect(fields).toContain('end');
    expect(fields).toContain('energy_kwh');
    expect(parsed.rows.length).toBe(197); // "Total" sentinel row excluded
  });

  it('builds a correct preview summary with no false duplicates on first import', async () => {
    const buf = fs.readFileSync(fixturePath);
    const file = new File([buf], 'source.xlsx');
    const parsed = await parseWorkbookFile(file);
    const preview = buildImportPreview(parsed, new Set());
    expect(preview.summary.userCount).toBe(2);
    expect(preview.summary.dateFrom?.startsWith('2026-01-01')).toBe(true);
    expect(preview.summary.totalKwh).toBeGreaterThan(4800);
    expect(preview.summary.totalKwh).toBeLessThan(4900);
    // the 6 zero-kWh rows should be flagged for review, not silently dropped
    const zeroKwhRows = preview.rows.filter((r) => r.flags.includes('zero_kwh'));
    expect(zeroKwhRows.length).toBe(6);
  });

  it('flags every row as duplicate on a re-import of the same file', async () => {
    const buf = fs.readFileSync(fixturePath);
    const file1 = new File([buf], 'source.xlsx');
    const parsed1 = await parseWorkbookFile(file1);
    const preview1 = buildImportPreview(parsed1, new Set());
    const existingKeys = new Set(preview1.rows.map((r) => r.dedupKey));

    const file2 = new File([buf], 'source.xlsx');
    const parsed2 = await parseWorkbookFile(file2);
    const preview2 = buildImportPreview(parsed2, existingKeys);
    expect(preview2.summary.newCount).toBe(0);
    expect(preview2.summary.duplicateCount).toBe(preview1.rows.length);
  });
});
