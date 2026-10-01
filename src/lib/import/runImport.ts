import { getOrCreateUserByName } from '../api/users';
import { getOrCreateCharger } from '../api/chargers';
import { insertSessions, type NewSessionInput } from '../api/sessions';
import { createImportBatch, updateImportBatchTotals, insertImportRecords } from '../api/imports';
import type { ImportPreview, PreviewRow } from './buildPreview';
import type { DataQualityFlag } from '../types';

export interface RunImportResult {
  importId: string;
  sessionsCreated: number;
}

/**
 * Commits a confirmed import preview: resolves users/chargers, inserts new
 * sessions, records every row's outcome (new/duplicate/error/review) for
 * the import-history / "view duplicates" screens, and writes the import
 * batch summary. Costs are NOT calculated here — call
 * recalculateAllCosts() afterwards (Data Management does this
 * automatically) once electricity prices for the new date range are cached.
 */
export async function runImport(preview: ImportPreview, filename: string, isDemo = false): Promise<RunImportResult> {
  const importBatch = await createImportBatch({
    filename,
    date_from: preview.summary.dateFrom,
    date_to: preview.summary.dateTo,
    column_mapping: Object.fromEntries(Object.entries(preview.columnMapping).map(([col, v]) => [col, v.field])),
    is_demo: isDemo,
  });

  const userCache = new Map<string, string>(); // normalized name -> user id
  const chargerCache = new Map<string, string>(); // external id -> charger id

  const newSessions: NewSessionInput[] = [];
  const rowSessionMap = new Map<number, string>(); // rowNumber -> dedup key, for import_records after insert

  const rowsToInsert = preview.rows.filter((r) => r.status !== 'error' && !r.isDuplicateInDb && !r.isDuplicateInFile);

  for (const row of rowsToInsert) {
    const userKey = row.userRaw!.trim().toLowerCase();
    let userId = userCache.get(userKey);
    if (!userId) {
      const user = await getOrCreateUserByName(row.userRaw!, row.externalUserId, isDemo);
      userId = user.id;
      userCache.set(userKey, userId);
    }

    const chargerKey = row.chargerRaw!.trim();
    let chargerId = chargerCache.get(chargerKey);
    if (!chargerId) {
      const charger = await getOrCreateCharger(chargerKey, isDemo);
      chargerId = charger.id;
      chargerCache.set(chargerKey, chargerId);
    }

    newSessions.push({
      source_session_id: row.sourceSessionId,
      dedup_key: row.dedupKey,
      user_id: userId,
      charger_id: chargerId,
      card_label: row.cardLabel,
      started_at: row.startedAtISO!,
      ended_at: row.endedAtISO!,
      duration_minutes: row.durationMinutes!,
      energy_kwh: row.energyKwh!,
      source_import_id: importBatch.id,
      is_demo: isDemo,
      data_quality_flags: row.flags as DataQualityFlag[],
    });
    rowSessionMap.set(row.rowNumber, row.dedupKey);
  }

  const insertedIds = await insertSessions(newSessions);

  // Re-fetch to map dedup_key -> id for accurate import_records linkage.
  const idByDedupKey = new Map<string, string>();
  newSessions.forEach((s, i) => idByDedupKey.set(s.dedup_key, insertedIds[i]));

  const importRecords = preview.rows.map((row: PreviewRow) => {
    const isNew = row.status !== 'error' && !row.isDuplicateInDb && !row.isDuplicateInFile;
    return {
      import_id: importBatch.id,
      row_number: row.rowNumber,
      status: (isNew ? 'new' : row.status === 'error' ? 'error' : row.status === 'review' && !row.isDuplicateInDb && !row.isDuplicateInFile ? 'review' : 'duplicate') as
        | 'new'
        | 'duplicate'
        | 'error'
        | 'review',
      raw_data: {
        user: row.userRaw,
        charger: row.chargerRaw,
        card: row.cardLabel,
        start: row.startedAtISO,
        end: row.endedAtISO,
        kwh: row.energyKwh,
        flags: row.flags,
      },
      session_id: isNew ? (idByDedupKey.get(row.dedupKey) ?? null) : null,
      duplicate_of_session_id: null,
      message: row.flags.length > 0 ? row.flags.join(', ') : null,
    };
  });
  await insertImportRecords(importRecords);

  await updateImportBatchTotals(importBatch.id, {
    records_found: preview.totalRowsFound,
    records_new: preview.summary.newCount,
    records_duplicate: preview.summary.duplicateCount,
    records_error: preview.summary.errorCount,
    records_review: preview.summary.reviewCount,
    total_kwh_imported: preview.summary.totalKwh,
  });

  return { importId: importBatch.id, sessionsCreated: insertedIds.length };
}
