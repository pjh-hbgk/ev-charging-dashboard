import type { ParsedWorkbook } from './excelParser';
import { parseLocalToUTC } from '../timezone';
import type { DataQualityFlag } from '../types';

export interface PreviewRow {
  rowNumber: number;
  userRaw: string | null;
  externalUserId: string | null;
  chargerRaw: string | null;
  cardLabel: string | null;
  sourceSessionId: string | null;
  startedAtISO: string | null;
  endedAtISO: string | null;
  durationMinutes: number | null;
  energyKwh: number | null;
  dedupKey: string;
  flags: DataQualityFlag[];
  status: 'ok' | 'error' | 'review';
  isDuplicateInFile: boolean;
  isDuplicateInDb: boolean;
}

export interface ImportPreview {
  sheetName: string;
  columnMapping: ParsedWorkbook['columnMapping'];
  missingRequiredFields: string[];
  totalRowsFound: number;
  rows: PreviewRow[];
  summary: {
    newCount: number;
    duplicateCount: number;
    errorCount: number;
    reviewCount: number;
    dateFrom: string | null;
    dateTo: string | null;
    userCount: number;
    totalKwh: number;
  };
}

function normalizeUserKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildDedupKey(row: {
  sourceSessionId: string | null;
  userRaw: string | null;
  chargerRaw: string | null;
  startedAtISO: string | null;
  endedAtISO: string | null;
  energyKwh: number | null;
}): string {
  if (row.sourceSessionId) return `sid:${row.sourceSessionId.trim()}`;
  const user = row.userRaw ? normalizeUserKey(row.userRaw) : 'unknown';
  const charger = (row.chargerRaw ?? 'unknown').trim().toLowerCase();
  const start = row.startedAtISO ?? 'unknown';
  const end = row.endedAtISO ?? 'unknown';
  const kwh = row.energyKwh !== null ? row.energyKwh.toFixed(3) : 'unknown';
  return `cmp:${charger}|${user}|${start}|${end}|${kwh}`;
}

export function buildImportPreview(
  parsed: ParsedWorkbook,
  existingDedupKeys: Set<string>
): ImportPreview {
  const seenInFile = new Set<string>();
  const rows: PreviewRow[] = [];

  for (const raw of parsed.rows) {
    const flags: DataQualityFlag[] = [];
    const userRaw = raw.values.user !== null ? String(raw.values.user) : null;
    const chargerRaw = raw.values.charger !== null ? String(raw.values.charger) : null;
    const cardLabel = raw.values.card_label !== null ? String(raw.values.card_label) : null;
    const sourceSessionId = raw.values.session_id !== null ? String(raw.values.session_id) : null;
    const energyKwh = raw.values.energy_kwh !== null ? Number(raw.values.energy_kwh) : null;

    let startedAtISO: string | null = null;
    let endedAtISO: string | null = null;
    try {
      if (raw.values.start) startedAtISO = parseLocalToUTC(String(raw.values.start)).iso;
    } catch {
      /* handled by missing_start flag below */
    }
    try {
      if (raw.values.end) endedAtISO = parseLocalToUTC(String(raw.values.end)).iso;
    } catch {
      /* handled by missing_end flag below */
    }

    if (!userRaw) flags.push('missing_user');
    if (!startedAtISO) flags.push('missing_start');
    if (!endedAtISO) flags.push('missing_end');

    let durationMinutes: number | null = null;
    if (startedAtISO && endedAtISO) {
      durationMinutes = Math.round((new Date(endedAtISO).getTime() - new Date(startedAtISO).getTime()) / 60000);
      if (durationMinutes <= 0) flags.push('end_before_start');
      else if (durationMinutes < 2) flags.push('very_short_session');
      else if (durationMinutes > 20 * 60) flags.push('very_large_session');
    }

    if (energyKwh === null) {
      // required field missing entirely
    } else if (energyKwh < 0) {
      flags.push('negative_kwh');
    } else if (energyKwh === 0) {
      flags.push('zero_kwh');
    } else if (energyKwh > 150) {
      flags.push('very_large_session');
    }

    const dedupKey = buildDedupKey({ sourceSessionId, userRaw, chargerRaw, startedAtISO, endedAtISO, energyKwh });
    const isDuplicateInDb = existingDedupKeys.has(dedupKey);
    const isDuplicateInFile = seenInFile.has(dedupKey);
    seenInFile.add(dedupKey);

    const hasBlockingError = !userRaw || !chargerRaw || !startedAtISO || !endedAtISO || energyKwh === null || (durationMinutes !== null && durationMinutes <= 0);
    const isDup = isDuplicateInDb || isDuplicateInFile;

    let status: PreviewRow['status'] = 'ok';
    if (hasBlockingError) status = 'error';
    else if (flags.some((f) => f === 'negative_kwh' || f === 'very_large_session')) status = 'review';

    rows.push({
      rowNumber: raw.rowNumber,
      userRaw,
      externalUserId: raw.values.external_user_id !== null ? String(raw.values.external_user_id) : null,
      chargerRaw,
      cardLabel,
      sourceSessionId,
      startedAtISO,
      endedAtISO,
      durationMinutes,
      energyKwh,
      dedupKey,
      flags,
      status,
      isDuplicateInFile,
      isDuplicateInDb,
    });
  }

  const okOrReviewRows = rows.filter((r) => r.status !== 'error');
  const newRows = okOrReviewRows.filter((r) => !r.isDuplicateInDb && !r.isDuplicateInFile);
  const dupRows = rows.filter((r) => r.isDuplicateInDb || r.isDuplicateInFile);
  const errorRows = rows.filter((r) => r.status === 'error');
  const reviewRows = rows.filter((r) => r.status === 'review');

  const validDates = rows.map((r) => r.startedAtISO).filter((d): d is string => Boolean(d)).sort();
  const users = new Set(rows.map((r) => r.userRaw).filter(Boolean));
  const totalKwh = newRows.reduce((s, r) => s + (r.energyKwh ?? 0), 0);

  return {
    sheetName: parsed.sheetName,
    columnMapping: parsed.columnMapping,
    missingRequiredFields: parsed.missingRequiredFields,
    totalRowsFound: rows.length,
    rows,
    summary: {
      newCount: newRows.length,
      duplicateCount: dupRows.length,
      errorCount: errorRows.length,
      reviewCount: reviewRows.length,
      dateFrom: validDates[0] ?? null,
      dateTo: validDates[validDates.length - 1] ?? null,
      userCount: users.size,
      totalKwh: Math.round(totalKwh * 100) / 100,
    },
  };
}
