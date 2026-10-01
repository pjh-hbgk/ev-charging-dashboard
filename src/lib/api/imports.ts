import { supabase } from '../supabaseClient';
import type { ImportBatch, ImportRecord } from '../types';

export async function listImports(): Promise<ImportBatch[]> {
  const { data, error } = await supabase.from('imports').select('*').order('imported_at', { ascending: false });
  if (error) throw error;
  return data as ImportBatch[];
}

export async function createImportBatch(input: {
  filename: string;
  date_from: string | null;
  date_to: string | null;
  column_mapping: Record<string, string>;
  is_demo: boolean;
}): Promise<ImportBatch> {
  const { data, error } = await supabase
    .from('imports')
    .insert({ ...input, status: 'completed' })
    .select('*')
    .single();
  if (error) throw error;
  return data as ImportBatch;
}

export async function updateImportBatchTotals(
  id: string,
  totals: { records_found: number; records_new: number; records_duplicate: number; records_error: number; records_review: number; total_kwh_imported: number }
) {
  const { error } = await supabase.from('imports').update(totals).eq('id', id);
  if (error) throw error;
}

export async function insertImportRecords(records: Omit<ImportRecord, 'id'>[]) {
  if (records.length === 0) return;
  const { error } = await supabase.from('import_records').insert(records);
  if (error) throw error;
}

export async function getImportRecords(importId: string, status?: string): Promise<ImportRecord[]> {
  let q = supabase.from('import_records').select('*').eq('import_id', importId).order('row_number');
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data as ImportRecord[];
}

/** Delete an import batch and all sessions that came from it (used for "undo a bad import"). */
export async function deleteImport(importId: string) {
  const { error: sessErr } = await supabase.from('charging_sessions').delete().eq('source_import_id', importId);
  if (sessErr) throw sessErr;
  const { error: impErr } = await supabase.from('imports').delete().eq('id', importId);
  if (impErr) throw impErr;
}
